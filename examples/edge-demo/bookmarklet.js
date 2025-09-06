javascript:(function(){
  var src = (window.JENNI_EDGE_SRC||'http://localhost:4000/edge/client.js');
  var s = document.createElement('script');
  s.src = src; s.defer = true; document.head.appendChild(s);
  s.onload=function(){ try{(window.JenniEdge||{init:function(){}}).init({ tenant:'demo', zip: prompt('ZIP','10001') || '10001', apiBase: 'http://localhost:4000/edge' });}catch(e){alert('JenniEdge init failed')}};
})();
