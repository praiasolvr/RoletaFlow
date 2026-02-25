import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, getDocs, query, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, ArrowLeft, Building2, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CompanyManagement() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: ''
  });

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const companiesQuery = query(collection(db, 'companies'), orderBy('name'));
      const snapshot = await getDocs(companiesQuery);
      const companiesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCompanies(companiesData);
    } catch (error) {
      console.error('Error loading companies:', error);
      toast.error('Erro ao carregar empresas');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (editingCompany) {
        await updateDoc(doc(db, 'companies', editingCompany.id), {
          name: formData.name
        });
        toast.success('Empresa atualizada com sucesso!');
      } else {
        await addDoc(collection(db, 'companies'), {
          name: formData.name,
          isActive: true,
          createdAt: new Date()
        });
        toast.success('Empresa adicionada com sucesso!');
      }

      setFormData({ name: '' });
      setEditingCompany(null);
      setIsDialogOpen(false);
      loadCompanies();
    } catch (error) {
      console.error('Error saving company:', error);
      toast.error('Erro ao salvar empresa');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (company) => {
    setEditingCompany(company);
    setFormData({ name: company.name });
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (company) => {
    try {
      await updateDoc(doc(db, 'companies', company.id), {
        isActive: !company.isActive
      });
      toast.success(`Empresa ${company.isActive ? 'inativada' : 'ativada'} com sucesso!`);
      loadCompanies();
    } catch (error) {
      console.error('Error toggling company:', error);
      toast.error('Erro ao atualizar empresa');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              data-testid="back-button"
              onClick={() => navigate('/admin/dashboard')}
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Gerenciar Empresas</h1>
              <p className="text-sm text-slate-400" style={{ fontFamily: 'Inter, sans-serif' }}>Adicione e gerencie empresas</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingCompany(null);
            setFormData({ name: '' });
          }
        }}>
          <DialogTrigger asChild>
            <Button
              data-testid="add-company-button"
              className="mb-6 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold h-12"
            >
              <Plus className="mr-2 h-5 w-5" />
              Adicionar Empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {editingCompany ? 'Editar Empresa' : 'Nova Empresa'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Nome da Empresa</Label>
                <Input
                  data-testid="company-name-input"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="bg-slate-950 border-slate-800 focus:border-amber-500 h-12 text-white"
                  placeholder="Digite o nome da empresa"
                />
              </div>

              <Button
                data-testid="submit-company-button"
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
              >
                {isLoading ? 'Salvando...' : (editingCompany ? 'Atualizar' : 'Adicionar')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <Card
              key={company.id}
              data-testid={`company-card-${company.id}`}
              className={`p-6 bg-slate-900/50 backdrop-blur-sm ${
                company.isActive ? 'border-slate-800/50' : 'border-slate-700/30 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-amber-500" />
                  <div>
                    <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {company.name}
                    </h3>
                    <p className={`text-xs ${
                      company.isActive ? 'text-emerald-500' : 'text-slate-500'
                    }`}>
                      {company.isActive ? 'Ativa' : 'Inativa'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  data-testid={`edit-company-${company.id}`}
                  onClick={() => handleEdit(company)}
                  variant="outline"
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button
                  data-testid={`toggle-company-${company.id}`}
                  onClick={() => handleToggleActive(company)}
                  variant="outline"
                  className={`flex-1 border-slate-700 ${
                    company.isActive
                      ? 'text-rose-400 hover:bg-rose-900/20'
                      : 'text-emerald-400 hover:bg-emerald-900/20'
                  }`}
                >
                  {company.isActive ? 'Inativar' : 'Ativar'}
                </Button>
              </div>
            </Card>
          ))}

          {companies.length === 0 && (
            <Card className="col-span-full p-8 bg-slate-900/50 backdrop-blur-sm border-slate-800/50 text-center">
              <Building2 className="h-12 w-12 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400">Nenhuma empresa cadastrada</p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
