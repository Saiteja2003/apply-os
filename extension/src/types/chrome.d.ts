// Chrome Extension API Type Declarations for ApplyOS Clipper
// Clean ambient declarations without external @types/chrome dependency

declare namespace chrome {
  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    interface MessageSender {
      id?: string;
      url?: string;
      tab?: tabs.Tab;
    }
  }

  namespace tabs {
    interface Tab {
      id?: number;
      index: number;
      windowId: number;
      highlighted: boolean;
      active: boolean;
      pinned: boolean;
      url?: string;
      title?: string;
      favIconUrl?: string;
      status?: string;
      incognito: boolean;
      width?: number;
      height?: number;
    }

    interface QueryInfo {
      active?: boolean;
      currentWindow?: boolean;
      lastFocusedWindow?: boolean;
      url?: string | string[];
    }

    function query(queryInfo: QueryInfo): Promise<Tab[]>;
    function create(createProperties: { url?: string; active?: boolean }): Promise<Tab>;
  }

  namespace scripting {
    interface InjectionTarget {
      tabId: number;
      allFrames?: boolean;
      frameIds?: number[];
    }

    interface ScriptInjection<T = unknown> {
      target: InjectionTarget;
      files?: string[];
      func?: (...args: any[]) => T;
      args?: any[];
    }

    interface InjectionResult<T = unknown> {
      documentId?: string;
      frameId?: number;
      result?: T;
    }

    function executeScript<T = unknown>(
      injection: ScriptInjection<T>,
    ): Promise<InjectionResult<T>[]>;
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }

    const sync: StorageArea;
    const local: StorageArea;
  }

  namespace permissions {
    interface Permissions {
      permissions?: string[];
      origins?: string[];
    }

    function contains(permissions: Permissions): Promise<boolean>;
    function request(permissions: Permissions): Promise<boolean>;
    function remove(permissions: Permissions): Promise<boolean>;
  }
}
