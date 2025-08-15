export interface EligibilityQuery {
  storeId: string;
  zip: string;
  gtin: string;
  price?: number;
}

export interface EligibilityResult {
  eligible: boolean;
  distanceMiles?: number;
  estimatedArrival?: string; // ISO
}

export interface OrderLine {
  gtin: string;
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

export interface JenniTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface JenniProduct {
  jenni_parent_id: string;
  title: string;
  description: string;
  brand: string;
  category: string;
  variants: JenniVariant[];
}

export interface JenniVariant {
  jenni_product_id: string;
  gtin: string;
  title: string;
  price: number;
  stock_status: string;
  zipcode_inventory: Record<string, string>;
}
