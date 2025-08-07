(()=> {
  async function check(zip, upc, storeId, gid){
    const r = await fetch(`/apps/jenni/v1/eligibility?zip=${zip}&upc=${upc}&storeId=${storeId}&productGid=${gid}`);
    return r.json();
  }
  function render(el, eligible, texts){
    el.textContent = eligible ? texts.pos : texts.neg;
    el.style.color = eligible ? '#008060' : '#a61d37';
  }
  document.addEventListener("DOMContentLoaded", ()=> {
    const el = document.getElementById("jenni-widget");
    if(!el) return;
    const upc = el.closest("[data-product-id]").querySelector("[name='sku']")?.value || '';
    const storeId = el.dataset.storeId;
    const gid = el.dataset.productGid;
    const texts = { pos: el.dataset.positive_text, neg: el.dataset.negative_text };
    const zip = localStorage.getItem("jenni_zip") || prompt("Enter ZIP for delivery:");
    localStorage.setItem("jenni_zip", zip);
    check(zip, upc, storeId, gid).then(res=> render(el, res.eligible, texts));
  });
})();
