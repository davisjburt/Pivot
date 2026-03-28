import { 
  db, 
  auth, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  updateDoc,
  handleFirestoreError,
  OperationType,
  FirebaseUser
} from '../firebase';
import { AppState, WeightEntry, UserGoal, AppSettings } from '../types';

export const firebaseService = {
  // User Profile & Settings
  getUserProfile: async (userId: string): Promise<Partial<AppState> | null> => {
    const path = `users/${userId}`;
    try {
      const docRef = doc(db, path);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as Partial<AppState>;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  saveUserProfile: async (userId: string, data: Partial<AppState>) => {
    const path = `users/${userId}`;
    try {
      const docRef = doc(db, path);
      await setDoc(docRef, data, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  // Weight Entries
  subscribeToEntries: (userId: string, callback: (entries: WeightEntry[]) => void) => {
    const path = `users/${userId}/entries`;
    const q = query(collection(db, path), orderBy('date', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => doc.data() as WeightEntry);
      callback(entries);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  },

  addEntry: async (userId: string, entry: WeightEntry) => {
    const path = `users/${userId}/entries/${entry.id}`;
    try {
      const docRef = doc(db, path);
      await setDoc(docRef, { ...entry, uid: userId });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  deleteEntry: async (userId: string, entryId: string) => {
    const path = `users/${userId}/entries/${entryId}`;
    try {
      const docRef = doc(db, path);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // Batch import
  importEntries: async (userId: string, entries: WeightEntry[]) => {
    // For simplicity, we'll do them sequentially or in small chunks
    // Firestore batch has a limit of 500, but let's just do them one by one for now
    // or use a Promise.all for better performance if the list isn't huge
    const promises = entries.map(entry => firebaseService.addEntry(userId, entry));
    await Promise.all(promises);
  }
};
