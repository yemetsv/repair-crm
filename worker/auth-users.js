
/**
 * TechnoSmart Repair CRM
 * Server-side user configuration.
 *
 * Passwords are never stored in this file.
 */

export const USERS = {
  manager: {
    role: "manager",
    point: null,
    passwordSecret: "AUTH_MANAGER_PASSWORD"
  },

  technosmart: {
    role: "staff",
    point: "Техносмарт",
    passwordSecret: "AUTH_TECHNOSMART_PASSWORD"
  },

  vodafone: {
    role: "staff",
    point: "Vodafone",
    passwordSecret: "AUTH_VODAFONE_PASSWORD"
  }
};
