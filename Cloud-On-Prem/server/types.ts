import { JoinRequest } from "@shared/schema";

// Extend Express Request to include custom properties
declare global {
  namespace Express {
    interface Request {
      joinRequest?: JoinRequest;
    }
  }
}

export {};
