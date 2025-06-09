import { DeltaID, PointerTarget, DeltaNetworkImageV1, DeltaNetworkImageV2, PointersV2 } from "./delta";
import { CreatorID, HostID, Timestamp } from "./types";

// Custom error types for delta operations
export class DeltaValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "DeltaValidationError";
  }
}

export class InvalidDeltaFormatError extends DeltaValidationError {
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = "InvalidDeltaFormatError";
  }
}

export class MissingRequiredFieldError extends DeltaValidationError {
  constructor(field: string) {
    super(`Missing required field: ${field}`, field);
    this.name = "MissingRequiredFieldError";
  }
}

export class InvalidPointerError extends DeltaValidationError {
  constructor(message: string, pointerIndex?: number) {
    super(message, pointerIndex !== undefined ? `pointer[${pointerIndex}]` : undefined);
    this.name = "InvalidPointerError";
  }
}

// Validation functions
export function validateDeltaId(id: unknown): id is DeltaID {
  if (typeof id !== "string" || id.length === 0) {
    throw new InvalidDeltaFormatError("Delta ID must be a non-empty string", "id");
  }
  return true;
}

export function validateTimestamp(timestamp: unknown, field: string): timestamp is Timestamp {
  if (typeof timestamp !== "number" || timestamp <= 0) {
    throw new InvalidDeltaFormatError(`${field} must be a positive number`, field);
  }
  return true;
}

export function validateHostId(host: unknown): host is HostID {
  if (typeof host !== "string" || host.length === 0) {
    throw new InvalidDeltaFormatError("Host ID must be a non-empty string", "host");
  }
  return true;
}

export function validateCreatorId(creator: unknown): creator is CreatorID {
  if (typeof creator !== "string" || creator.length === 0) {
    throw new InvalidDeltaFormatError("Creator ID must be a non-empty string", "creator");
  }
  return true;
}

export function validatePointerTarget(target: unknown): target is PointerTarget {
  if (target !== null && typeof target !== "string" && typeof target !== "number" && typeof target !== "boolean") {
    throw new InvalidPointerError("Pointer target must be string, number, boolean, or null");
  }
  return true;
}

export function validatePointerV1(pointer: unknown, index: number): pointer is { localContext: string; target: PointerTarget; targetContext?: string } {
  if (!pointer || typeof pointer !== "object" || Array.isArray(pointer)) {
    throw new InvalidPointerError(`Pointer at index ${index} must be an object`, index);
  }

  const p = pointer as Record<string, unknown>;

  if (typeof p.localContext !== "string" || p.localContext.length === 0) {
    throw new InvalidPointerError(`Pointer at index ${index} must have a non-empty localContext`, index);
  }

  validatePointerTarget(p.target);

  if (p.targetContext !== undefined && 
      (typeof p.targetContext !== "string" || p.targetContext.length === 0)) {
    throw new InvalidPointerError(`Pointer at index ${index} targetContext must be a non-empty string if present`, index);
  }

  // Validate pointer consistency: if targetContext exists, target must be a string (reference)
  if (p.targetContext && typeof p.target !== "string") {
    throw new InvalidPointerError(`Pointer at index ${index} with targetContext must have string target (reference)`, index);
  }

  return true;
}

export function validatePointersV1(pointers: unknown): pointers is Array<{ localContext: string; target: PointerTarget; targetContext?: string }> {
  if (!Array.isArray(pointers)) {
    throw new InvalidDeltaFormatError("Pointers must be an array", "pointers");
  }

  if (pointers.length === 0) {
    throw new InvalidDeltaFormatError("Delta must have at least one pointer", "pointers");
  }

  (pointers as unknown[]).forEach((pointer, index) => validatePointerV1(pointer, index));
  return true;
}

export function validatePointersV2(pointers: unknown): pointers is PointersV2 {
  if (!pointers || typeof pointers !== "object" || Array.isArray(pointers)) {
    throw new InvalidDeltaFormatError("Pointers must be an object", "pointers");
  }

  const keys = Object.keys(pointers);
  if (keys.length === 0) {
    throw new InvalidDeltaFormatError("Delta must have at least one pointer", "pointers");
  }

  for (const [key, value] of Object.entries(pointers)) {
    if (key.length === 0) {
      throw new InvalidPointerError("Pointer key must be a non-empty string");
    }

    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && typeof value !== "object") {
      throw new InvalidPointerError(`Invalid pointer value for key '${key}'`);
    }

    // If value is an object (Reference), validate it
    if (value && typeof value === "object") {
      const refKeys = Object.keys(value);
      if (refKeys.length !== 1) {
        throw new InvalidPointerError(`Reference pointer '${key}' must have exactly one key-value pair`);
      }
      const [refKey, refValue] = Object.entries(value)[0];
      if (typeof refKey !== "string" || refKey.length === 0) {
        throw new InvalidPointerError(`Reference key in pointer '${key}' must be a non-empty string`);
      }
      if (typeof refValue !== "string" || refValue.length === 0) {
        throw new InvalidPointerError(`Reference value in pointer '${key}' must be a non-empty string`);
      }
    }
  }

  return true;
}

export function validateDeltaNetworkImageV1(delta: unknown): delta is DeltaNetworkImageV1 {
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) {
    throw new InvalidDeltaFormatError("Delta must be an object");
  }

  // Check required fields
  if (!("id" in delta)) throw new MissingRequiredFieldError("id");
  if (!("timeCreated" in delta)) throw new MissingRequiredFieldError("timeCreated");
  if (!("host" in delta)) throw new MissingRequiredFieldError("host");
  if (!("creator" in delta)) throw new MissingRequiredFieldError("creator");
  if (!("pointers" in delta)) throw new MissingRequiredFieldError("pointers");

  // Validate field types
  validateDeltaId(delta.id);
  validateTimestamp(delta.timeCreated, "timeCreated");
  validateHostId(delta.host);
  validateCreatorId(delta.creator);
  validatePointersV1(delta.pointers);

  return true;
}

export function validateDeltaNetworkImageV2(delta: unknown): delta is DeltaNetworkImageV2 {
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) {
    throw new InvalidDeltaFormatError("Delta must be an object");
  }

  // Check required fields
  if (!("id" in delta)) throw new MissingRequiredFieldError("id");
  if (!("timeCreated" in delta)) throw new MissingRequiredFieldError("timeCreated");
  if (!("host" in delta)) throw new MissingRequiredFieldError("host");
  if (!("creator" in delta)) throw new MissingRequiredFieldError("creator");
  if (!("pointers" in delta)) throw new MissingRequiredFieldError("pointers");

  // Validate field types
  validateDeltaId(delta.id);
  validateTimestamp(delta.timeCreated, "timeCreated");
  validateHostId(delta.host);
  validateCreatorId(delta.creator);
  validatePointersV2(delta.pointers);

  return true;
}