// Run checkRowDivider(tab) with a Browser-plugin tab on the local songbook.
// Catches the legacy last-row rule hiding the separator above reserved space.
export async function checkRowDivider(tab) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const search = tab.playwright.getByRole('textbox', { name: '搜索歌名、歌手或编号' });
  const clearSearch = async () => {
    await search.press('ControlOrMeta+A');
    await search.press('Backspace');
    await tab.playwright.getByText('001', { exact: true }).waitFor({ state: 'visible' });
  };
  const read = () => tab.playwright.evaluate(() => {
    const table = document.querySelector('main.catalog .table-shell > table');
    const rows = [...table.querySelectorAll('tbody tr')];
    const shell = table.closest('.table-shell');
    const catalog = table.closest('.catalog');
    const borders = row => [...row.cells].map(cell => {
      const style = getComputedStyle(cell);
      return {
        bottom: style.borderBottomWidth,
        style: style.borderBottomStyle,
        color: style.borderBottomColor,
        top: style.borderTopWidth,
        left: style.borderLeftWidth,
        right: style.borderRightWidth
      };
    });
    return {
      desktop: getComputedStyle(rows[0]).display === 'table-row',
      count: table.querySelectorAll('.copy').length,
      shellHeight: shell.clientHeight,
      catalogHeight: catalog.offsetHeight,
      rowHeight: rows[0].offsetHeight,
      first: borders(rows[0]),
      last: borders(rows[rows.length - 1]),
      cardBottom: getComputedStyle(rows[rows.length - 1]).borderBottomWidth
    };
  });
  await clearSearch();
  await tab.playwright.getByRole('button', { name: '1', exact: true }).click();
  await tab.playwright.getByText('001', { exact: true }).waitFor({ state: 'visible' });
  const first = await read();
  check(first.count === 10, 'First page must contain ten real songs');
  await tab.playwright.getByRole('button', { name: '64', exact: true }).click();
  await tab.playwright.getByText('631', { exact: true }).last().waitFor({ state: 'visible' });
  const last = await read();
  check(last.count === 1, 'Last page must contain one real song');
  check(first.shellHeight === last.shellHeight && first.catalogHeight === last.catalogHeight,
    'The last page must preserve the full-page space');

  const checkDividers = (cells, label) => cells.forEach((cell, index) => {
    check(parseFloat(cell.bottom) > 0 && cell.style === 'solid',
      `${label}, cell ${index + 1}: missing horizontal separator (${cell.bottom} ${cell.style})`);
    check(cell.bottom === first.first[index].bottom && cell.color === first.first[index].color,
      `${label}, cell ${index + 1}: separator differs from normal rows`);
    check([cell.top, cell.left, cell.right].every(value => parseFloat(value) === 0),
      `${label}: must not add a rectangular frame or column borders`);
  });
  if (first.desktop) {
    checkDividers(last.first, 'Last page');
    checkDividers(first.last, 'Last row on full page');
    check(first.rowHeight === last.rowHeight, 'The remaining row must not stretch or shrink');
  } else {
    check(parseFloat(last.cardBottom) > 0, 'Mobile song card must retain its existing boundary');
  }
  await search.fill('Always Online');
  await tab.playwright.getByText('Always Online', { exact: true }).waitFor({ state: 'visible' });
  const single = await read();
  check(single.count === 1 && single.shellHeight === first.shellHeight, 'Single result must preserve the full-page space');
  if (first.desktop) checkDividers(single.first, 'Single search result');
  await clearSearch();
  return { passed: true, desktop: first.desktop, firstRowHeight: first.rowHeight,
    lastRowHeight: last.rowHeight, shellHeight: first.shellHeight,
    catalogHeight: first.catalogHeight, lastDivider: last.first[0] };
}
