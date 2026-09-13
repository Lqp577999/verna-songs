const $=q=>document.querySelector(q);
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
const secure=location.protocol==='https:'||(['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.protocol==='http:');
if(!secure){$('#error').textContent='请使用 HTTPS 或本机 localhost 打开设置页，禁止通过不安全的 HTTP 输入令牌。';$('#key').disabled=$('#generate').disabled=true;}
$('#setup-form').onsubmit=event=>{event.preventDefault();if(!secure)return;const key=$('#key').value.trim();if(!key||/\s/.test(key)){$('#error').textContent='请输入有效的专用令牌，不应包含空白字符。';return;}const link=new URL('./',location.href);link.hash='key='+encodeURIComponent(key);$('#private-link').value=link.href;$('#open').href=link.href;$('#key').value='';$('#result').hidden=false;$('#error').textContent='';$('#status').textContent='';};
$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#private-link').value);$('#status').textContent='已复制，请安全保存。';}catch{$('#private-link').select();$('#status').textContent='浏览器未允许自动复制，请手动复制选中的完整链接。';}};
$('#clear').onclick=()=>{$('#private-link').value='';$('#open').removeAttribute('href');$('#result').hidden=true;};
