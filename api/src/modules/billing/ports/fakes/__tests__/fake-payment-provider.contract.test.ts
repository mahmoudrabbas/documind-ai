import { describe, beforeEach, afterEach } from "vitest";
import { FakePaymentProvider } from "../fake-payment-provider.js";
import { paymentProviderContractTests } from "../../__tests__/payment-provider.contract.suite.js";

describe("FakePaymentProvider", () => {
  let fake: FakePaymentProvider;

  beforeEach(() => {
    fake = new FakePaymentProvider();
    fake._reset();
  });

  afterEach(() => {
    fake._reset();
  });

  paymentProviderContractTests("FakePaymentProvider", () => {
    const p = new FakePaymentProvider();
    p._reset();
    return p;
  });
});
