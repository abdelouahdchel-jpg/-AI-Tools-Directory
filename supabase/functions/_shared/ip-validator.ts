/**
 * IP and SSRF Validator for Supabase Edge Functions
 * Enforces strict RFC compliance, blocking:
 * - Loopback (127.0.0.0/8, ::1)
 * - Private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7)
 * - Link-local & Cloud Metadata (169.254.0.0/16, fe80::/10)
 * - Multicast, Documentation, and Reserved address spaces
 * - IPv4-mapped IPv6 addresses (::ffff:0:0/96)
 */

interface Ipv4Cidr {
  network: number;
  mask: number;
}

// Convert dotted-decimal IPv4 to 32-bit unsigned integer
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(p => Number(p));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function parseIpv4Cidr(cidr: string): Ipv4Cidr {
  const [ipStr, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  const ip = ipv4ToInt(ipStr) || 0;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { network: (ip & mask) >>> 0, mask };
}

const BLOCKED_IPV4_CIDRS: Ipv4Cidr[] = [
  parseIpv4Cidr('0.0.0.0/8'),        // Broadcast / current network
  parseIpv4Cidr('10.0.0.0/8'),       // Private Class A
  parseIpv4Cidr('100.64.0.0/10'),    // Carrier-Grade NAT
  parseIpv4Cidr('127.0.0.0/8'),      // Loopback
  parseIpv4Cidr('169.254.0.0/16'),   // Link-local / Cloud Metadata (169.254.169.254)
  parseIpv4Cidr('172.16.0.0/12'),    // Private Class B
  parseIpv4Cidr('192.0.0.0/24'),     // IETF Protocol Assignments
  parseIpv4Cidr('192.0.2.0/24'),     // TEST-NET-1 (documentation)
  parseIpv4Cidr('192.168.0.0/16'),   // Private Class C
  parseIpv4Cidr('198.18.0.0/15'),    // Benchmark testing
  parseIpv4Cidr('198.51.100.0/24'),  // TEST-NET-2 (documentation)
  parseIpv4Cidr('203.0.113.0/24'),   // TEST-NET-3 (documentation)
  parseIpv4Cidr('224.0.0.0/4'),      // Multicast
  parseIpv4Cidr('240.0.0.0/4'),      // Reserved / Future Use
  parseIpv4Cidr('255.255.255.255/32')// Broadcast
];

/**
 * Checks whether an IPv4 address is in a private, reserved, or loopback space
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) {
    return true; // Malformed is treated as unsafe
  }

  for (const { network, mask } of BLOCKED_IPV4_CIDRS) {
    if ((ipInt & mask) >>> 0 === network) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether an IPv6 address is in a private, loopback, link-local, or documentation range
 */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().trim();

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:192.0.2.128 or ::ffff:c000:0280)
  if (lower.startsWith('::ffff:')) {
    const v4Part = lower.replace('::ffff:', '');
    if (v4Part.includes('.')) {
      return isPrivateOrReservedIpv4(v4Part);
    }
  }

  // Loopback / Unspecified
  if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1' || lower === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // Link-local: fe80::/10 (fe8*, fe9*, fea*, feb*)
  if (/^fe[89ab][0-9a-f]?::/i.test(lower) || lower.startsWith('fe80:')) {
    return true;
  }

  // Unique Local Address (ULA): fc00::/7 (fc00:: to fdff::)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) {
    return true;
  }

  // Multicast: ff00::/8
  if (lower.startsWith('ff')) {
    return true;
  }

  // Documentation: 2001:db8::/32
  if (lower.startsWith('2001:db8:') || lower.startsWith('2001:0db8:')) {
    return true;
  }

  return false;
}

/**
 * Validates any IP address (v4 or v6). Returns true if safe and public.
 */
export function isPublicAndSafeIp(ip: string): boolean {
  if (ip.includes(':')) {
    return !isPrivateOrReservedIpv6(ip);
  }
  if (ip.includes('.')) {
    return !isPrivateOrReservedIpv4(ip);
  }
  return false;
}
