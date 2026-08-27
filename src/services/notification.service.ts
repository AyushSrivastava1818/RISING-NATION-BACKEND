import { config } from '../config/index.js';

export interface IdeaNotificationPayload {
  id: string;
  title: string;
  contact_email: string;
}

export interface EnquiryNotificationPayload {
  id: string;
  type: string;
  contact_email: string;
}

export class NotificationService {
  /**
   * Synchronous notification with a short timeout.
   * Swallows and logs on failure per ARCHITECTURE.md §3.3 / AD-8.
   * A broken notification/email provider will NEVER fail the user's submission.
   */
  async notifyAdminOnIdeaSubmission(payload: IdeaNotificationPayload): Promise<boolean> {
    const timeoutMs = 2000;

    try {
      const sendPromise = this.sendEmailStub(
        config.ADMIN_NOTIFICATION_EMAIL,
        `New Idea Submitted: ${payload.title}`,
        `A new idea has been submitted by ${payload.contact_email} (ID: ${payload.id}). Please review in the admin panel.`
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Notification email timeout')), timeoutMs);
      });

      await Promise.race([sendPromise, timeoutPromise]);
      return true;
    } catch (err: any) {
      console.warn(`[NOTIFICATION_SWALLOWED] Failed to send admin notification for idea ${payload.id}:`, err?.message || err);
      // Swallowed and logged: do not throw!
      return false;
    }
  }

  /**
   * Same swallow-and-log pattern as notifyAdminOnIdeaSubmission — REQ-BIZ-002 /
   * REQ-CREATOR-002 enquiry submissions get the same admin-notification side
   * effect as idea submissions (ARCHITECTURE.md §3.9 Email), not a separate
   * notification system.
   */
  async notifyAdminOnEnquirySubmission(payload: EnquiryNotificationPayload): Promise<boolean> {
    const timeoutMs = 2000;

    try {
      const sendPromise = this.sendEmailStub(
        config.ADMIN_NOTIFICATION_EMAIL,
        `New Enquiry Submitted: ${payload.type}`,
        `A new ${payload.type} enquiry has been submitted by ${payload.contact_email} (ID: ${payload.id}). Please review in the admin panel.`
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Notification email timeout')), timeoutMs);
      });

      await Promise.race([sendPromise, timeoutPromise]);
      return true;
    } catch (err: any) {
      console.warn(`[NOTIFICATION_SWALLOWED] Failed to send admin notification for enquiry ${payload.id}:`, err?.message || err);
      return false;
    }
  }

  private async sendEmailStub(to: string, subject: string, body: string): Promise<void> {
    // Stub email sender: Slice 9 / real provider wiring connects to actual email gateway
    console.log(`[STUB EMAIL] To: ${to} | Subject: ${subject} | Body: ${body}`);
  }
}

export const notificationService = new NotificationService();
