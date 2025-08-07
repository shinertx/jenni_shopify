import React from "react";
import { AppProvider, Card, Page } from "@shopify/polaris";
import { authenticatedFetch, AppBridgeProvider } from "@shopify/app-bridge-react";
import { BrowserRouter } from "react-router-dom";

export default function AdminApp() {
  return (
    <AppProvider>
      <AppBridgeProvider config={{}}>
        <BrowserRouter>
          <Page title="JENNi Dashboard">
            <Card>
              <p>Orders will appear here soon.</p>
            </Card>
          </Page>
        </BrowserRouter>
      </AppBridgeProvider>
    </AppProvider>
  );
}
