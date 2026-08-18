import type { DeviceProfileV1 } from "../../shared/profileProtocol.js";

export interface ProfileUpdatedEvent {
  deviceId: string;
  profile: DeviceProfileV1;
  changedAt: string;
}

export type ProfileUpdatedListener = (event: ProfileUpdatedEvent) => void;

export class ProfileEventHub {
  readonly #listeners = new Set<ProfileUpdatedListener>();

  publish(event: ProfileUpdatedEvent): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // A listener failure must not affect committed profile updates or other listeners.
      }
    }
  }

  subscribe(listener: ProfileUpdatedListener): () => void {
    this.#listeners.add(listener);

    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.#listeners.delete(listener);
    };
  }
}
