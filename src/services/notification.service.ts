import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

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
      // Swallowed, never thrown (§3.3) — logged without contact_email (§6.5: never log PII at info level).
      logger.warn('notification_swallowed', { domain: 'idea', id: payload.id, error: err?.message || String(err) });
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
      logger.warn('notification_swallowed', { domain: 'enquiry', id: payload.id, error: err?.message || String(err) });
      return false;
    }
  }

  /**
   * Stub email sender: Slice 9 / real provider wiring connects to actual
   * email gateway. `body` is deliberately never logged — it embeds the
   * submitter's contact_email, which must never be logged at info level
   * (ENGINEERING.md §6.5). A real provider would send `body` over
   * SMTP/API, not stdout.
   */
  private async sendEmailStub(to: string, subject: string, _body: string): Promise<void> {
    logger.info('stub_email_sent', { to, subject });
  }
}

export const notificationService = new NotificationService();
