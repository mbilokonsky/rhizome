import { DeltaV1, DeltaV2 } from "../src/delta";
import {
  InvalidDeltaFormatError,
  MissingRequiredFieldError,
  InvalidPointerError,
  validateDeltaNetworkImageV1,
  validateDeltaNetworkImageV2
} from "../src/delta-validation";

describe("Delta Validation", () => {
  describe("Invalid Delta Formats", () => {
    describe("DeltaV1 validation", () => {
      it("should throw error for non-object delta", () => {
        expect(() => validateDeltaNetworkImageV1(null)).toThrow(InvalidDeltaFormatError);
        expect(() => validateDeltaNetworkImageV1("string")).toThrow(InvalidDeltaFormatError);
        expect(() => validateDeltaNetworkImageV1(123)).toThrow(InvalidDeltaFormatError);
        expect(() => validateDeltaNetworkImageV1([])).toThrow(InvalidDeltaFormatError);
      });

      it("should throw error for invalid ID types", () => {
        const invalidDeltas = [
          { id: null, timeCreated: 123, host: "host", creator: "creator", pointers: [] },
          { id: 123, timeCreated: 123, host: "host", creator: "creator", pointers: [] },
          { id: "", timeCreated: 123, host: "host", creator: "creator", pointers: [] },
          { id: {}, timeCreated: 123, host: "host", creator: "creator", pointers: [] }
        ];

        invalidDeltas.forEach(delta => {
          expect(() => validateDeltaNetworkImageV1(delta)).toThrow(InvalidDeltaFormatError);
        });
      });

      it("should throw error for invalid timestamp", () => {
        const invalidDeltas = [
          { id: "id", timeCreated: "123", host: "host", creator: "creator", pointers: [] },
          { id: "id", timeCreated: -123, host: "host", creator: "creator", pointers: [] },
          { id: "id", timeCreated: 0, host: "host", creator: "creator", pointers: [] },
          { id: "id", timeCreated: null, host: "host", creator: "creator", pointers: [] }
        ];

        invalidDeltas.forEach(delta => {
          expect(() => validateDeltaNetworkImageV1(delta)).toThrow(InvalidDeltaFormatError);
        });
      });

      it("should throw error for invalid host/creator", () => {
        const invalidDeltas = [
          { id: "id", timeCreated: 123, host: null, creator: "creator", pointers: [] },
          { id: "id", timeCreated: 123, host: "", creator: "creator", pointers: [] },
          { id: "id", timeCreated: 123, host: 123, creator: "creator", pointers: [] },
          { id: "id", timeCreated: 123, host: "host", creator: null, pointers: [] },
          { id: "id", timeCreated: 123, host: "host", creator: "", pointers: [] },
          { id: "id", timeCreated: 123, host: "host", creator: 123, pointers: [] }
        ];

        invalidDeltas.forEach(delta => {
          expect(() => validateDeltaNetworkImageV1(delta)).toThrow(InvalidDeltaFormatError);
        });
      });

      it("should throw error for non-array pointers", () => {
        const invalidDeltas = [
          { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: null },
          { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: {} },
          { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: "pointers" },
          { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: 123 }
        ];

        invalidDeltas.forEach(delta => {
          expect(() => validateDeltaNetworkImageV1(delta)).toThrow(InvalidDeltaFormatError);
        });
      });

      it("should throw error for empty pointers array", () => {
        const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: [] };
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(InvalidDeltaFormatError);
      });

      it("should throw error for invalid pointer structure", () => {
        const invalidPointers = [
          [null],
          ["string"],
          [123],
          [{ localContext: null, target: "target" }],
          [{ localContext: "", target: "target" }],
          [{ localContext: 123, target: "target" }],
          [{ localContext: "context", target: undefined }],
          [{ localContext: "context", target: {} }],
          [{ localContext: "context", target: [] }]
        ];

        invalidPointers.forEach(pointers => {
          const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers };
          expect(() => validateDeltaNetworkImageV1(delta)).toThrow(InvalidPointerError);
        });
      });

      it("should throw error for invalid targetContext", () => {
        const invalidPointers = [
          [{ localContext: "context", target: "target", targetContext: null }],
          [{ localContext: "context", target: "target", targetContext: "" }],
          [{ localContext: "context", target: "target", targetContext: 123 }],
          [{ localContext: "context", target: "target", targetContext: {} }]
        ];

        invalidPointers.forEach(pointers => {
          const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers };
          expect(() => validateDeltaNetworkImageV1(delta)).toThrow(InvalidPointerError);
        });
      });

      it("should throw error for pointer consistency violation", () => {
        // If targetContext exists, target must be a string (reference)
        const pointers = [{ localContext: "context", target: 123, targetContext: "property" }];
        const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers };
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(InvalidPointerError);
      });
    });

    describe("DeltaV2 validation", () => {
      it("should throw error for non-object delta", () => {
        expect(() => validateDeltaNetworkImageV2(null)).toThrow(InvalidDeltaFormatError);
        expect(() => validateDeltaNetworkImageV2("string")).toThrow(InvalidDeltaFormatError);
        expect(() => validateDeltaNetworkImageV2(123)).toThrow(InvalidDeltaFormatError);
        expect(() => validateDeltaNetworkImageV2([])).toThrow(InvalidDeltaFormatError);
      });

      it("should throw error for invalid pointers object", () => {
        const invalidDeltas = [
          { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: null },
          { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: [] },
          { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: "pointers" },
          { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: 123 }
        ];

        invalidDeltas.forEach(delta => {
          expect(() => validateDeltaNetworkImageV2(delta)).toThrow(InvalidDeltaFormatError);
        });
      });

      it("should throw error for empty pointers object", () => {
        const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers: {} };
        expect(() => validateDeltaNetworkImageV2(delta)).toThrow(InvalidDeltaFormatError);
      });

      it("should throw error for invalid pointer keys", () => {
        const invalidPointers = [
          { "": "value" }
        ];

        invalidPointers.forEach(pointers => {
          const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers };
          expect(() => validateDeltaNetworkImageV2(delta)).toThrow(InvalidPointerError);
        });
      });

      it("should throw error for invalid pointer values", () => {
        const invalidPointers = [
          { key: undefined },
          { key: [] }
        ];

        invalidPointers.forEach(pointers => {
          const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers };
          expect(() => validateDeltaNetworkImageV2(delta)).toThrow(InvalidPointerError);
        });
      });

      it("should throw error for invalid reference format", () => {
        const invalidReferences = [
          { key: {} }, // Empty reference
          { key: { ref1: "val1", ref2: "val2" } }, // Multiple keys
          { key: { "": "value" } }, // Empty key
          { key: { ref: "" } }, // Empty value
          { key: { ref: 123 } }, // Non-string value
          { key: { ref: null } } // Null value
        ];

        invalidReferences.forEach(pointers => {
          const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator", pointers };
          expect(() => validateDeltaNetworkImageV2(delta)).toThrow(InvalidPointerError);
        });
      });
    });
  });

  describe("Missing Required Fields", () => {
    describe("DeltaV1", () => {
      it("should throw MissingRequiredFieldError for missing id", () => {
        const delta = { timeCreated: 123, host: "host", creator: "creator", pointers: [] };
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(MissingRequiredFieldError);
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(/id/);
      });

      it("should throw MissingRequiredFieldError for missing timeCreated", () => {
        const delta = { id: "id", host: "host", creator: "creator", pointers: [] };
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(MissingRequiredFieldError);
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(/timeCreated/);
      });

      it("should throw MissingRequiredFieldError for missing host", () => {
        const delta = { id: "id", timeCreated: 123, creator: "creator", pointers: [] };
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(MissingRequiredFieldError);
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(/host/);
      });

      it("should throw MissingRequiredFieldError for missing creator", () => {
        const delta = { id: "id", timeCreated: 123, host: "host", pointers: [] };
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(MissingRequiredFieldError);
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(/creator/);
      });

      it("should throw MissingRequiredFieldError for missing pointers", () => {
        const delta = { id: "id", timeCreated: 123, host: "host", creator: "creator" };
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(MissingRequiredFieldError);
        expect(() => validateDeltaNetworkImageV1(delta)).toThrow(/pointers/);
      });
    });

    describe("DeltaV2", () => {
      it("should throw MissingRequiredFieldError for all missing fields", () => {
        const requiredFields = ["id", "timeCreated", "host", "creator", "pointers"];
        
        requiredFields.forEach(field => {
          const delta: Record<string, unknown> = {
            id: "id",
            timeCreated: 123,
            host: "host",
            creator: "creator",
            pointers: { key: "value" }
          };
          delete delta[field];
          
          expect(() => validateDeltaNetworkImageV2(delta)).toThrow(MissingRequiredFieldError);
          expect(() => validateDeltaNetworkImageV2(delta)).toThrow(new RegExp(field));
        });
      });
    });
  });

  describe("Valid Delta Formats", () => {
    it("should accept valid DeltaV1", () => {
      const validDeltas = [
        {
          id: "uuid-123",
          timeCreated: 123456789,
          host: "host1",
          creator: "creator1",
          pointers: [{ localContext: "name", target: "Alice" }]
        },
        {
          id: "uuid-456",
          timeCreated: 987654321,
          host: "host2",
          creator: "creator2",
          pointers: [
            { localContext: "name", target: "Bob" },
            { localContext: "age", target: 25 },
            { localContext: "active", target: null }
          ]
        },
        {
          id: "uuid-789",
          timeCreated: 111111111,
          host: "host3",
          creator: "creator3",
          pointers: [{ localContext: "friend", target: "user123", targetContext: "friendOf" }]
        }
      ];

      validDeltas.forEach(delta => {
        expect(() => validateDeltaNetworkImageV1(delta)).not.toThrow();
      });
    });

    it("should accept valid DeltaV2", () => {
      const validDeltas = [
        {
          id: "uuid-123",
          timeCreated: 123456789,
          host: "host1",
          creator: "creator1",
          pointers: { name: "Alice" }
        },
        {
          id: "uuid-456",
          timeCreated: 987654321,
          host: "host2",
          creator: "creator2",
          pointers: {
            name: "Bob",
            age: 25,
            active: null
          }
        },
        {
          id: "uuid-789",
          timeCreated: 111111111,
          host: "host3",
          creator: "creator3",
          pointers: { friend: { user123: "friendOf" } }
        }
      ];

      validDeltas.forEach(delta => {
        expect(() => validateDeltaNetworkImageV2(delta)).not.toThrow();
      });
    });
  });

  describe("Delta class integration", () => {
    it("should validate when creating DeltaV1 from network image", () => {
      const invalidDelta = {
        id: "id",
        timeCreated: "not-a-number",
        host: "host",
        creator: "creator",
        pointers: [{ localContext: "name", target: "value" }]
      };

      expect(() => DeltaV1.fromNetworkImage(invalidDelta as never)).toThrow(InvalidDeltaFormatError);
    });

    it("should validate when creating DeltaV2 from network image", () => {
      const invalidDelta = {
        id: "id",
        timeCreated: 123,
        host: "",
        creator: "creator",
        pointers: { name: "value" }
      };

      expect(() => DeltaV2.fromNetworkImage(invalidDelta as never)).toThrow(InvalidDeltaFormatError);
    });

    it("should accept valid network images", () => {
      const validV1 = {
        id: "uuid-123",
        timeCreated: 123456789,
        host: "host1",
        creator: "creator1",
        pointers: [{ localContext: "name", target: "Alice" }]
      };

      const validV2 = {
        id: "uuid-456",
        timeCreated: 987654321,
        host: "host2",
        creator: "creator2",
        pointers: { name: "Bob" }
      };

      expect(() => DeltaV1.fromNetworkImage(validV1)).not.toThrow();
      expect(() => DeltaV2.fromNetworkImage(validV2)).not.toThrow();
    });
  });
});