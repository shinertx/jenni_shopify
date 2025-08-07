export default function deliveryCustomization(input, checkout) {
  const nextDayRate = checkout.deliveryGroups.flatMap(group => group.deliveryOptions)
    .find(option => option.title=== "Next-Day Delivery");

  if (!nextDayRate) return { operations: [] };

  const zip = checkout.shippingAddress?.zip;
  const lines = checkout.lineItems;

  // quick heuristic – assume we stored eligibility in cart attributes
  const eligible = checkout.attributes.find(a=>a.key==='jenni_all_eligible')?.value === 'true';

  if (!eligible) {
    return {
      operations: [
        {
          hide: { deliveryOptionHandle: nextDayRate.handle }
        }
      ]
    };
  }
  return { operations: [] };
}
