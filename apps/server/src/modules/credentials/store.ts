export interface BiliCredentialStore {
  has(): Promise<boolean>;
  read(): Promise<string | null>;
  write(sessdata: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCredentialStore implements BiliCredentialStore {
  private value: string | null = null;

  public async has(): Promise<boolean> {
    return this.value !== null;
  }

  public async read(): Promise<string | null> {
    return this.value;
  }

  public async write(sessdata: string): Promise<void> {
    this.value = sessdata;
  }

  public async clear(): Promise<void> {
    this.value = null;
  }
}
