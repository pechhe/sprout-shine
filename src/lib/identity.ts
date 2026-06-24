// No-auth pilot identity. A parent is identified by an opaque key kept in
// localStorage; the active child id is cached alongside it.
const PARENT_KEY = 'sprout.parentKey';
const CHILD_KEY = 'sprout.childId';

export function parentKey(): string {
  let key = localStorage.getItem(PARENT_KEY);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(PARENT_KEY, key);
  }
  return key;
}

export function getChildId(): string | null {
  return localStorage.getItem(CHILD_KEY);
}

export function setChildId(id: string) {
  localStorage.setItem(CHILD_KEY, id);
}

export function resetIdentity() {
  localStorage.removeItem(PARENT_KEY);
  localStorage.removeItem(CHILD_KEY);
}
