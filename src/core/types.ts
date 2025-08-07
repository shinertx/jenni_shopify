export interface EligibilityQuery {
  storeId: string;
  zip: string;
  upc: string;
  price?: number;
}

export interface EligibilityResult {
  eligible: boolean;
  distanceMiles?: number;
  estimatedArrival?: string; // ISO
}

export interface OrderLine {
  upc: string;
  quantity: number;
  price: number;
}

export interface JenniOrder {
  storeId: string;
  orderId: string;
  address: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
  lines: OrderLine[];
}
