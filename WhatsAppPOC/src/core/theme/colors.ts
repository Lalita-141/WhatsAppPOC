export interface ThemeColors {
  background: string;
  surface: string;
  card: string;
  primary: string;
  secondary: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  placeholder: string;
}

export const colors = {
  light: {
    background: '#F0F2F5', // WhatsApp light background tint (slightly off-white)
    surface: '#FFFFFF',    // Standard pure white surface
    card: '#FFFFFF',       // Card background
    primary: '#008069',   // WhatsApp brand green
    secondary: '#00A884', // Secondary green
    text: '#111B21',      // Deep charcoal/black
    textSecondary: '#667781', // Muted slate gray
    border: '#E9EDEF',    // Soft border divider color
    error: '#EA0038',     // Red error highlight
    success: '#25D366',   // WhatsApp green success highlight
    warning: '#F3A13C',   // Yellow warning highlight
    placeholder: '#8696A0', // WhatsApp-style placeholder gray
  },
  dark: {
    background: '#0B141A', // Dark mode deep teal/black background
    surface: '#111B21',    // Slightly lighter dark surface
    card: '#202C33',       // Muted dark card surface
    primary: '#00A884',   // Light active WhatsApp green
    secondary: '#8696A0', // Muted light gray
    text: '#E9EDEF',      // Off-white readable text
    textSecondary: '#8696A0', // Muted text color
    border: '#222E35',    // Dark mode border divider color
    error: '#EF5350',     // Bright red error text/icon
    success: '#00E676',   // Bright green success highlight
    warning: '#FFD600',   // Bright yellow warning highlight
    placeholder: '#667781', // Dark mode placeholder gray
  },
};
