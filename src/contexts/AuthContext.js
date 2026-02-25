import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);

  // Estado para dados do perfil do usuário (Firestore)
  const [userProfile, setUserProfile] = useState(null);

  // Loading do estado do Firebase Auth (onAuthStateChanged)
  const [loading, setLoading] = useState(true);

  // Loading para perfil do Firestore
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    // Escuta mudança no estado de autenticação
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setCurrentUser(user);

      if (user) {
        setLoadingProfile(true);
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data());
          } else {
            setUserProfile(null);
          }
        } catch (error) {
          console.error('Erro ao buscar perfil:', error);
          setUserProfile(null);
        }
        setLoadingProfile(false);
      } else {
        setUserProfile(null);
        setLoadingProfile(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  // Registrar usuário e salvar perfil com role admin
  const register = async (name, email, password) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, 'users', user.uid), {
      name,
      email,
      role: 'admin',
      createdAt: new Date(),
    });

    setUserProfile({ name, email, role: 'admin' });
    setCurrentUser(user);
  };

  const value = {
    currentUser,
    userProfile,
    login,
    logout,
    register,
    loading,
    loadingProfile,
  };

  // Só renderiza os filhos após autenticação e perfil carregados
  return <AuthContext.Provider value={value}>{!loading && !loadingProfile && children}</AuthContext.Provider>;
};
