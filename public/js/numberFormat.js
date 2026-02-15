/**
 * Number formatting utilities (1.2M, 50K, etc.)
 */
const NumberFormat = {
  /**
   * Format a number into a short readable string.
   * Examples: 1234567 -> "1.23M", 50000 -> "50K", 123 -> "123"
   */
  short(value) {
    if (value == null || isNaN(value)) return '--';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (abs >= 1_000_000_000) {
      return sign + (abs / 1_000_000_000).toFixed(2) + 'B';
    }
    if (abs >= 1_000_000) {
      return sign + (abs / 1_000_000).toFixed(2) + 'M';
    }
    if (abs >= 1_000) {
      return sign + (abs / 1_000).toFixed(1) + 'K';
    }
    if (abs >= 1) {
      return sign + abs.toFixed(1);
    }
    return sign + abs.toFixed(2);
  },

  /**
   * Format a number with commas as thousands separator.
   * Example: 1234567.89 -> "1,234,567.89"
   */
  full(value, decimals = 1) {
    if (value == null || isNaN(value)) return '--';
    const parts = value.toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  },

  /**
   * Format a percentage.
   */
  percent(value) {
    if (value == null || isNaN(value)) return '--';
    return value.toFixed(2) + '%';
  },

  /**
   * Parse a short format string back to a number.
   * Examples: "1.23M" -> 1230000, "50K" -> 50000, "3.0" -> 3
   */
  parse(str) {
    if (!str || typeof str !== 'string') return NaN;
    str = str.trim().replace(/,/g, '');

    const match = str.match(/^(-?\d+\.?\d*)\s*([KkMmBb]?)$/);
    if (!match) return parseFloat(str);

    let num = parseFloat(match[1]);
    const suffix = match[2].toUpperCase();

    if (suffix === 'K') num *= 1_000;
    else if (suffix === 'M') num *= 1_000_000;
    else if (suffix === 'B') num *= 1_000_000_000;

    return num;
  },

  /**
   * Format a number into the shortest appropriate suffix form for input display.
   */
  toInput(value) {
    if (value == null || isNaN(value)) return '';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (abs >= 1_000_000 && abs % 1_000_000 === 0) {
      return sign + (abs / 1_000_000) + 'M';
    }
    if (abs >= 1_000 && abs % 1_000 === 0) {
      return sign + (abs / 1_000) + 'K';
    }
    if (Number.isInteger(abs)) {
      return sign + abs.toString();
    }
    return sign + abs.toString();
  },
};
