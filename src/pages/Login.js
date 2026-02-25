import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isRegister) {
        // 🔥 Criar usuário no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        const user = userCredential.user;

        // 🔥 Salvar no Firestore como ADMIN automaticamente
        await setDoc(doc(db, 'users', user.uid), {
          name,
          email,
          role: 'admin',
          createdAt: new Date()
        });

        toast.success('Conta criada como ADMIN!');
        navigate('/admin/dashboard');

      } else {
        await login(email, password);
        toast.success('Login realizado com sucesso!');
        navigate('/dashboard');
      }

    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar solicitação.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-8">
      <div className="w-full max-w-md">

        <h2 className="text-3xl font-bold text-white mb-6">
          {isRegister ? 'Criar Conta' : 'Entrar'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          {isRegister && (
            <div>
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading
              ? 'Processando...'
              : isRegister
              ? 'Criar Conta'
              : 'Entrar'}
          </Button>
        </form>

        <div className="mt-4 text-center text-slate-400">
          {isRegister ? 'Já possui conta?' : 'Não possui conta?'}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="ml-2 text-amber-500"
          >
            {isRegister ? 'Entrar' : 'Criar conta'}
          </button>
        </div>

      </div>
    </div>
  );
}
