export interface LanAddress {
  name: string;
  address: string;
}
export function lanIPv4(
  nets: Record<
    string,
    { family: string | number; internal: boolean; address: string }[] | undefined
  >,
): LanAddress[];
export function firewallCommand(ports: number[]): string;
export function firewallRemoveCommand(): string;
