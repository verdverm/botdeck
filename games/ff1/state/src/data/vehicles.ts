/**
 * Final Fantasy 1 (NES) vehicle constants.
 *
 * Vehicle state is split between:
 * - The current vehicle byte at $0042 (VERIFIED)
 * - Visibility/ownership bytes in unsram for ship ($6000), airship ($6004),
 *   and canoe ($6012) (VERIFIED)
 */

/** Current vehicle values at ADDR_VEHICLE ($0042). */
export const CURRENT_VEHICLE = {
  /** On foot. */
  FOOT: 0x01,

  /** In the canoe. */
  CANOE: 0x02,

  /** On the ship. */
  SHIP: 0x04,

  /** In the airship. */
  AIRSHIP: 0x08,
} as const;

export type CurrentVehicle = (typeof CURRENT_VEHICLE)[keyof typeof CURRENT_VEHICLE];

export const CURRENT_VEHICLE_NAMES: Readonly<Record<CurrentVehicle, string>> = {
  [CURRENT_VEHICLE.FOOT]: "Foot",
  [CURRENT_VEHICLE.CANOE]: "Canoe",
  [CURRENT_VEHICLE.SHIP]: "Ship",
  [CURRENT_VEHICLE.AIRSHIP]: "Airship",
};

/** Owned-vehicle bytes in unsram. Nonzero means owned. */
export const OWNED_VEHICLES = {
  SHIP: { addr: 0x6000, name: "Ship" },
  AIRSHIP: { addr: 0x6004, name: "Airship" },
  CANOE: { addr: 0x6012, name: "Canoe" },
} as const;

/** Check if a specific current-vehicle value is active. */
export function isCurrentVehicle(value: number, vehicle: CurrentVehicle): boolean {
  return value === vehicle;
}

/** Get the name of the current vehicle, if the value is known. */
export function getCurrentVehicleName(value: number): string | undefined {
  return CURRENT_VEHICLE_NAMES[value as CurrentVehicle];
}

/** Check if a vehicle ownership byte indicates the vehicle is owned. */
export function hasVehicleOwnership(byte: number): boolean {
  return byte !== 0;
}

/** Return the set of owned vehicle names from the three ownership bytes. */
export function ownedVehicles(shipByte: number, airshipByte: number, canoeByte: number): string[] {
  const owned: string[] = [];
  if (hasVehicleOwnership(shipByte)) owned.push(OWNED_VEHICLES.SHIP.name);
  if (hasVehicleOwnership(airshipByte)) owned.push(OWNED_VEHICLES.AIRSHIP.name);
  if (hasVehicleOwnership(canoeByte)) owned.push(OWNED_VEHICLES.CANOE.name);
  return owned;
}
