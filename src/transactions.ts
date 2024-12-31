import Debug from "debug";
import EventEmitter from "events";
import {Delta, DeltaID} from "./delta.js";
import {DomainEntityID, TransactionID} from "./types.js";
const debug = Debug("transactions");

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
}

export class Transactions {
  transactions = new Map<TransactionID, Transaction>();
  eventStream = new EventEmitter();

  get(id: TransactionID): Transaction | undefined {
    return this.transactions.get(id);
  }

  getOrInit(id: TransactionID): Transaction {
    let t = this.transactions.get(id);
    if (!t) {
      t = new Transaction();
      this.transactions.set(id, t);
    }
    return t;
  }

  ingestDelta(delta: Delta, targets: DomainEntityID[]): TransactionID | undefined {
    {
      const transactionId = getDeltaTransactionId(delta);
      if (transactionId) {
        const t = this.getOrInit(transactionId);
        for (const id of targets) {
          t.entityIds.add(id);
        }

        // This delta is part of a transaction
        // Add this to the delta's data structure for quick reference
        delta.transactionId = transactionId;

        // Update our transaction tracking
        this.receivedDelta(transactionId, delta.id);

        // Notify that the transaction is complete
        if (this.isComplete(transactionId)) {
          this.eventStream.emit("completed", transactionId);
        }

        return transactionId;
      }
    }

    {
      const {transactionId, size} = getTransactionSize(delta) || {};
      if (transactionId && size) {
        // This delta describes a transaction

        debug(`transaction ${transactionId} has size ${size}`);

        this.setSize(transactionId, size as number);

        // Check if the transaction is complete
        if (this.isComplete(transactionId)) {
          this.eventStream.emit("completed", transactionId);
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
    const t = this.getOrInit(id);
    return t.size !== undefined && t.receivedDeltaIds.size === t.size;
  }

  setSize(id: TransactionID, size: number) {
    const t = this.getOrInit(id);
    t.size = size;
  }

  get ids() {
    return Array.from(this.transactions.keys());
  }
}
