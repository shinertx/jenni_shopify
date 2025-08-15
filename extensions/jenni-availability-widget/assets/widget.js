(()=> {
  async function check(zip, gtin, storeId, gid){
    const r = await fetch(`/apps/jenni/v1/eligibility?zip=${zip}&gtin=${gtin}&storeId=${storeId}&productGid=${gid}`);
    return r.json();
  }
  function render(el, eligible, texts){
    el.textContent = eligible ? texts.pos : texts.neg;
    el.style.color = eligible ? '#008060' : '#a61d37';
  }
  document.addEventListener("DOMContentLoaded", ()=> {
    const el = document.getElementById("jenni-widget");
    if(!el) return;
    // Try to get GTIN from product data, fallback to SKU
    const gtin = el.closest("[data-product-id]").querySelector("[name='gtin']")?.value || 
                 el.closest("[data-product-id]").querySelector("[name='sku']")?.value || '';
    const storeId = el.dataset.storeId;
    const gid = el.dataset.productGid;
    const texts = { pos: el.dataset.positive_text, neg: el.dataset.negative_text };
    const zip = localStorage.getItem("jenni_zip") || prompt("Enter ZIP for delivery:");
    localStorage.setItem("jenni_zip", zip);
    check(zip, gtin, storeId, gid).then(res=> render(el, res.eligible, texts));
  });
})();
