export const LEGACY_STORE_ID = "obs-bygg-tonsberg";

export type SystemRole = "platform_admin" | "user";
export type StoreRole = "store_admin" | "user";

export type EnterpriseStore = {
  id: string;
  name: string;
  sapNumber?: string;
  active: boolean;
};

export type EnterpriseUserProfile = {
  uid: string;
  email: string;
  displayName: string;
  systemRole: SystemRole;
  defaultStoreId: string;
  storeIds: string[];
  active: boolean;
};

export const legacyStore: EnterpriseStore = {
  id: LEGACY_STORE_ID,
  name: "Obs Bygg Tønsberg",
  active: true,
};

export function storeCollectionPath(storeId: string, collectionName: string) {
  return storeId === LEGACY_STORE_ID ? collectionName : `stores/${storeId}/${collectionName}`;
}

export function storeDocumentPath(storeId: string, collectionName: string, documentId: string) {
  return `${storeCollectionPath(storeId, collectionName)}/${documentId}`;
}
