import type { KeyObject } from "node:crypto";

export interface InteropKeyPair {
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export interface EncryptedEvent {
  kind: "encrypted-event";
  role: string;
  event: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

export interface DecryptedEvent<TPayload = unknown> {
  role: string;
  event: string;
  payload: TPayload;
}

export function createInteropKeyPair(): InteropKeyPair;
export function exportPublicKey(publicKey: KeyObject): string;
export function deriveSharedKey(args: {
  privateKey: KeyObject;
  peerPublicKey: string;
  issueNumber: number;
}): Buffer;
export function createEncryptedEvent<TPayload>(args: {
  role: string;
  event: string;
  payload: TPayload;
  key: Buffer;
}): EncryptedEvent;
export function decryptEncryptedEvent<TPayload>(args: {
  encryptedEvent: EncryptedEvent;
  key: Buffer;
}): DecryptedEvent<TPayload>;
export function tamperEncryptedEventForTest(encryptedEvent: EncryptedEvent): EncryptedEvent;
export function createGitHubRendezvousClient(args: {
  owner: string;
  repo: string;
  token: string;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}): {
  createIssue(args: { title: string }): Promise<{ number: number }>;
  postHello(args: { issueNumber: number; role: string; publicKey: string }): Promise<unknown>;
  postEncryptedEvent(args: {
    issueNumber: number;
    encryptedEvent: EncryptedEvent;
  }): Promise<unknown>;
  listComments(issueNumber: number): Promise<Array<{ id: number; body: string }>>;
  deleteComment(commentId: number): Promise<unknown>;
  closeIssue(issueNumber: number): Promise<unknown>;
  waitForPeerHello(args: {
    issueNumber: number;
    selfRole: string;
    timeoutMs?: number;
    intervalMs?: number;
  }): Promise<{ id: number; role: string; publicKey: string }>;
  waitForEncryptedEvent(args: {
    issueNumber: number;
    selfRole: string;
    timeoutMs?: number;
    intervalMs?: number;
    event?: string;
  }): Promise<EncryptedEvent & { id: number }>;
  cleanup(issueNumber: number): Promise<void>;
};
