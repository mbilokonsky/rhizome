import Debug from "debug";
import EventEmitter from "events";
import {Delta, DeltaID} from "../core/delta";
import {Hyperview} from "../views/hyperview";
import {DomainEntityID, TransactionID} from "../core/types";
const debug = Debug('rz:transactions');

function getDeltaTransactionId(delta: Delta): TransactionID | undefined {
  const {target: transactionId} = delta.pointers.find(({
    localContext,
    target,
    targetContext
  }) =>
    localContext === "_transaction" &&
    typeof target === "string" &&
    targetContext === "deltas"
  ) || {};

  if (transactionId && typeof transactionId === "string") {
    return transactionId;
  }
}

function getTransactionSize(delta: Delta): {
  transactionId: TransactionID,
  size: number
} | undefined {
  const {target: transactionId} = delta.pointers.find(({
    localContext,
    target,
    targetContext
  }) =>
    localContext === "_transaction" &&
    typeof target === "string" &&
    targetContext === "size"
  ) || {};

  if (transactionId && typeof transactionId === "string") {
    // This delta describes a transaction
    const {target: size} = delta.pointers.find(({
      localContext,
      target
    }) =>
      localContext === "size" &&
      typeof target === "number"
    ) || {};

    return {transactionId, size: size as number};
  }
}

export class Transaction {
  size?: number;
  receivedDeltaIds = new Set<DeltaID>();
  entityIds = new Set<DomainEntityID>();
  resolved: Promise<boolean>;

  constructor(readonly transactions: Transactions, readonly id: TransactionID) {
    this.resolved = new Promise((resolve) => {
      this.transactions.eventStream.on("completed", (transactionId) => {
        if (transactionId === this.id) resolve(true);
      });
    });
  }

  getReceivedDeltaIds() {
    return Array.from(this.receivedDeltaIds.values());
  }
}

export class Transactions {
  transactions = new Map<TransactionID, Transaction>();
  eventStream = new EventEmitter();

  constructor(readonly hyperview: Hyperview) {}

  get(id: TransactionID): Transaction | undefined {
    return this.transactions.get(id);
  }

  getOrInit(id: TransactionID): Transaction {
    let t = this.transactions.get(id);
    if (!t) {
      t = new Transaction(this, id);
      this.transactions.set(id, t);
    }
    return t;
  }

  ingestDelta(delta: Delta, targets: DomainEntityID[]): TransactionID | undefined {
    // This delta may be part of a transaction
    {
      const transactionId = getDeltaTransactionId(delta);
      if (transactionId) {
        const t = this.getOrInit(transactionId);
        for (const id of targets) {
          t.entityIds.add(id);
        }

        // Add this to the delta's data structure for quick reference
        delta.transactionId = transactionId;

        // Update our transaction tracking
        this.receivedDelta(transactionId, delta.id);

        // Notify that the transaction is complete
        if (this.isComplete(transactionId)) {
          this.eventStream.emit("completed", t.id, t.getReceivedDeltaIds());
        }

        return transactionId;
      }
    }

    // This delta may describe a transaction
    {
      const {transactionId, size} = getTransactionSize(delta) || {};
      if (transactionId && size) {
        debug(`[${this.hyperview.rhizomeNode.config.peerId}]`, `Transaction ${transactionId} has size ${size}`);

        this.setSize(transactionId, size as number);

        // Check if the transaction is complete
        if (this.isComplete(transactionId)) {
          const t = this.getOrInit(transactionId);
          this.eventStream.emit("completed", t.id, t.getReceivedDeltaIds());
        }

        return transactionId;
      }
    }
  }

  receivedDelta(id: TransactionID, deltaId: DeltaID) {
    const t = this.getOrInit(id);
    t.receivedDeltaIds.add(deltaId);
  }

  isComplete(id: TransactionID) {
    const t = this.get(id);
    if (!t) return false;
    if (t.size === undefined) return false;
    return t.receivedDeltaIds.size === t.size;
  }

  async waitFor(id: TransactionID) {
    const t = this.get(id);
    if (!t) return;
    await t.resolved;
  }

  setSize(id: TransactionID, size: number) {
    const t = this.getOrInit(id);
    t.size = size;
  }

  get ids() {
    return Array.from(this.transactions.keys());
  }
}
