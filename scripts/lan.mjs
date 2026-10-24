// `pnpm run demo -- --lan` yardımcıları (saf işlevler; apps/api/src/g18.test.ts sınar).

/** Yerel ağ IPv4 adresleri: dahili olmayan, 169.254 (APIPA) olmayan; özel ağ aralıkları öne alınır. */
export function lanIPv4(nets) {
  const found = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const n of list ?? []) {
      const v4 = n.family === 'IPv4' || n.family === 4;
      if (!v4 || n.internal || n.address.startsWith('169.254.')) continue;
      found.push({ name, address: n.address });
    }
  }
  const rank = (a) =>
    a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : a.startsWith('172.') ? 2 : 3;
  return found.sort((a, b) => rank(a.address) - rank(b.address));
}

/** Windows güvenlik duvarı: telefonun bilgisayara erişebilmesi için gelen bağlantı kuralı (yönetici PowerShell). */
export function firewallCommand(ports) {
  return (
    'netsh advfirewall firewall add rule name="Tarim Pusula Demo" dir=in action=allow protocol=TCP ' +
    `localport=${ports.join(',')} profile=private`
  );
}

export function firewallRemoveCommand() {
  return 'netsh advfirewall firewall delete rule name="Tarim Pusula Demo"';
}
