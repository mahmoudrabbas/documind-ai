declare module "stripe" {
  class Stripe {
    constructor(secretKey: string, options?: { apiVersion?: string });
    customers: {
      create(params: {
        email?: string;
        name?: string;
        metadata?: Record<string, string>;
      }): Promise<{ id: string }>;
    };
    checkout: {
      sessions: {
        create(params: {
          customer?: string;
          mode: string;
          line_items: Array<{ price: string; quantity: number }>;
          success_url: string;
          cancel_url: string;
          metadata?: Record<string, string>;
        }): Promise<{
          id: string;
          url: string | null;
          status: string | null;
          customer: string | Stripe | null;
          metadata: Record<string, string> | null;
        }>;
        retrieve(sessionId: string): Promise<{
          id: string;
          url: string | null;
          status: string | null;
          customer: string | Stripe | null;
          metadata: Record<string, string> | null;
        }>;
      };
    };
  }

  export default Stripe;
}
