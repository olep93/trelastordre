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
  sapNumber: "3588",
  active: true,
};

export const pilotStores: EnterpriseStore[] = [
  legacyStore,
  { id: "3571", name: "Obs Bygg Sandefjord", sapNumber: "3571", active: true },
  { id: "5087", name: "Obs Bygg Skien", sapNumber: "5087", active: true },
  { id: "2603", name: "Obs Bygg Mjøndalen", sapNumber: "2603", active: true },
  { id: "3570", name: "Obs Bygg Kongsberg", sapNumber: "3570", active: true },
];

export function storeCollectionPath(storeId: string, collectionName: string) {
  return storeId === LEGACY_STORE_ID ? collectionName : `stores/${storeId}/${collectionName}`;
}

export function storeDocumentPath(storeId: string, collectionName: string, documentId: string) {
  return `${storeCollectionPath(storeId, collectionName)}/${documentId}`;
}
