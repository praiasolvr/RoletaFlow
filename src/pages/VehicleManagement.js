// -------------- IMPORTS --------------
import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, getDocs, query, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, ArrowLeft, Bus, Edit, Grid, List } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function VehicleManagement() {
  const navigate = useNavigate();

  // Dados principais
  const [vehicles, setVehicles] = useState([]);
  const [companies, setCompanies] = useState([]);

  // Modal de adicionar/editar
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);

  // Modal de pré-visualização
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validRows, setValidRows] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);

  const [isLoading, setIsLoading] = useState(false);

  // Busca e modo de visualização
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("cards"); // cards | list

  const [formData, setFormData] = useState({
    number: '',
    plate: '',
    type: '',
    companyId: ''
  });

  // ------------------ LOAD DATA ------------------
  useEffect(() => {
    loadVehicles();
    loadCompanies();
  }, []);

  const loadVehicles = async () => {
    try {
      const vehiclesQuery = query(collection(db, 'vehicles'), orderBy('number'));
      const snapshot = await getDocs(vehiclesQuery);
      const companiesSnapshot = await getDocs(collection(db, 'companies'));

      const vehiclesData = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const company = companiesSnapshot.docs.find(c => c.id === data.companyId);

        return {
          id: docSnap.id,
          ...data,
          companyName: company?.data()?.name || 'N/A'
        };
      });

      setVehicles(vehiclesData);
    } catch (error) {
      console.error('Error loading vehicles:', error);
      toast.error('Erro ao carregar veículos');
    }
  };

  const loadCompanies = async () => {
    try {
      const companiesQuery = query(collection(db, 'companies'), orderBy('name'));
      const snapshot = await getDocs(companiesQuery);

      const companiesData = snapshot.docs
        .filter(doc => doc.data().isActive)
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

      setCompanies(companiesData);
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  // ------------------ CRUD ------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (editingVehicle) {
        await updateDoc(doc(db, 'vehicles', editingVehicle.id), {
          number: formData.number,
          plate: formData.plate,
          type: formData.type,
          companyId: formData.companyId
        });
        toast.success('Veículo atualizado com sucesso!');
      } else {
        await addDoc(collection(db, 'vehicles'), {
          number: formData.number,
          plate: formData.plate,
          type: formData.type,
          companyId: formData.companyId,
          isActive: true,
          createdAt: new Date()
        });
        toast.success('Veículo adicionado com sucesso!');
      }

      setFormData({ number: '', plate: '', type: '', companyId: '' });
      setEditingVehicle(null);
      setIsDialogOpen(false);
      loadVehicles();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      toast.error('Erro ao salvar veículo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      number: vehicle.number,
      plate: vehicle.plate,
      type: vehicle.type,
      companyId: vehicle.companyId
    });
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (vehicle) => {
    try {
      await updateDoc(doc(db, 'vehicles', vehicle.id), {
        isActive: !vehicle.isActive
      });
      toast.success(`Veículo ${vehicle.isActive ? 'inativado' : 'ativado'} com sucesso!`);
      loadVehicles();
    } catch (error) {
      console.error('Error toggling vehicle:', error);
      toast.error('Erro ao atualizar veículo');
    }
  };

  // ------------------ IMPORTAÇÃO CSV ------------------
  const handleImportCSV = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target.result;

        const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");

        const companyMap = {};
        companies.forEach(c => {
          companyMap[c.name.toLowerCase()] = c.id;
        });

        const existingNumbers = new Set(vehicles.map(v => v.number));

        const valid = [];
        const invalid = [];

        lines.forEach((line, index) => {
          const [numero, placa, tipo, empresa] = line.split(";");

          const row = {
            numero: numero?.trim(),
            placa: placa?.trim().toUpperCase(),
            tipo: tipo?.trim(),
            empresa: empresa?.trim(),
            line: index + 1
          };

          // Validação 1: número duplicado
          if (existingNumbers.has(row.numero)) {
            invalid.push({ ...row, motivo: "Número de veículo já cadastrado" });
            return;
          }

          // Validação 2: empresa não encontrada
          const companyId = companyMap[row.empresa?.toLowerCase()];
          if (!companyId) {
            invalid.push({ ...row, motivo: "Empresa não encontrada" });
            return;
          }

          valid.push({
            ...row,
            companyId
          });
        });

        setValidRows(valid);
        setInvalidRows(invalid);

        // Abre modal automaticamente
        setPreviewOpen(true);

      } catch (error) {
        console.error(error);
        toast.error("Erro ao processar CSV");
      } finally {
        // 🔥 Permite reimportar o mesmo arquivo 
        event.target.value = null;
        setIsLoading(false);
      }
    };

    reader.readAsText(file, "UTF-8");
  };

  // ------------------ CONFIRMAR IMPORTAÇÃO ------------------
  const confirmImport = async () => {
    try {
      setIsLoading(true);

      const promises = validRows.map(async (row) => {
        await addDoc(collection(db, "vehicles"), {
          number: row.numero,
          plate: row.placa,
          type: row.tipo,
          companyId: row.companyId,
          isActive: true,
          createdAt: new Date()
        });
      });

      await Promise.all(promises);

      toast.success("Importação concluída com sucesso!");

      setPreviewOpen(false);
      loadVehicles();

    } catch (error) {
      console.error(error);
      toast.error("Erro ao importar veículos");
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------ FILTRO DE BUSCA ------------------
  const filteredVehicles = vehicles.filter(v => {
    const term = search.toLowerCase();
    return (
      v.number.toLowerCase().includes(term) ||
      v.plate.toLowerCase().includes(term) ||
      v.type.toLowerCase().includes(term) ||
      v.companyName.toLowerCase().includes(term)
    );
  });
  // ------------------ UI ------------------
  return (
    <div className="min-h-screen bg-slate-950">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate('/admin/dashboard')}
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Gerenciar Veículos</h1>
              <p className="text-sm text-slate-400">Adicione e gerencie veículos</p>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="container mx-auto px-4 py-8">

        {/* TOPO: BUSCA + MODO DE VISUALIZAÇÃO */}
        <div className="flex items-center justify-between mb-6">
          <Input
            placeholder="Pesquisar veículo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900 border-slate-700 text-white w-64"
          />

          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "cards" ? "default" : "outline"}
              onClick={() => setViewMode("cards")}
              className="h-10"
            >
              <Grid className="h-4 w-4" />
            </Button>

            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              onClick={() => setViewMode("list")}
              className="h-10"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* BOTÕES */}
        <div className="flex gap-3 mb-6">
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingVehicle(null);
              setFormData({ number: '', plate: '', type: '', companyId: '' });
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold h-12">
                <Plus className="mr-2 h-5 w-5" />
                Adicionar Veículo
              </Button>
            </DialogTrigger>

            {/* MODAL ADICIONAR/EDITAR */}
            <DialogContent className="bg-slate-900 border-slate-800 text-white">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  {editingVehicle ? 'Editar Veículo' : 'Novo Veículo'}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input
                      value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      required
                      className="bg-slate-950 border-slate-800 h-12 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Placa</Label>
                    <Input
                      value={formData.plate}
                      onChange={(e) => setFormData({ ...formData, plate: e.target.value.toUpperCase() })}
                      required
                      className="bg-slate-950 border-slate-800 h-12 text-white font-mono"
                      maxLength={8}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Input
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    required
                    className="bg-slate-950 border-slate-800 h-12 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Select
                    value={formData.companyId}
                    onValueChange={(value) => setFormData({ ...formData, companyId: value })}
                    required
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800 h-12 text-white">
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id} className="text-white">
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
                >
                  {isLoading ? 'Salvando...' : (editingVehicle ? 'Atualizar' : 'Adicionar')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* BOTÃO IMPORTAR */}
          <Button
            onClick={() => document.getElementById('csvInput')?.click()}
            variant="outline"
            className="h-12 border-slate-700 text-white hover:bg-slate-800"
          >
            Importar Veículo
          </Button>

          <input
            id="csvInput"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCSV}
          />
        </div>

        {/* MODAL DE PRÉ-VISUALIZAÇÃO */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Pré-visualização da Importação</DialogTitle>
            </DialogHeader>

            {/* TABELA */}
            <div className="max-h-[400px] overflow-auto border border-slate-800 rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="p-2 text-left">Linha</th>
                    <th className="p-2 text-left">Número</th>
                    <th className="p-2 text-left">Placa</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">Empresa</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {/* VÁLIDOS */}
                  {validRows.map((row, i) => (
                    <tr key={`valid-${i}`} className="bg-emerald-900/20">
                      <td className="p-2">{row.line}</td>
                      <td className="p-2">{row.numero}</td>
                      <td className="p-2">{row.placa}</td>
                      <td className="p-2">{row.tipo}</td>
                      <td className="p-2">{row.empresa}</td>
                      <td className="p-2 text-emerald-400 font-semibold">Válido</td>
                    </tr>
                  ))}

                  {/* INVÁLIDOS */}
                  {invalidRows.map((row, i) => (
                    <tr key={`invalid-${i}`} className="bg-rose-900/20">
                      <td className="p-2">{row.line}</td>
                      <td className="p-2">{row.numero}</td>
                      <td className="p-2">{row.placa}</td>
                      <td className="p-2">{row.tipo}</td>
                      <td className="p-2">{row.empresa}</td>
                      <td className="p-2 text-rose-400 font-semibold">{row.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* BOTÕES */}
            <div className="flex justify-end gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => setPreviewOpen(false)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </Button>

              <Button
                onClick={confirmImport}
                disabled={validRows.length === 0 || isLoading}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
              >
                {isLoading ? "Importando..." : `Importar ${validRows.length} veículo(s)`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* LISTA EM CARDS */}
        {viewMode === "cards" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVehicles.map((vehicle) => (
              <Card
                key={vehicle.id}
                className={`p-6 bg-slate-900/50 backdrop-blur-sm ${vehicle.isActive ? 'border-slate-800/50' : 'border-slate-700/30 opacity-60'
                  }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Bus className="h-8 w-8 text-amber-500" />
                    <div>
                      <h3 className="text-lg font-mono font-bold text-white">
                        {vehicle.number}
                      </h3>
                      <p className="text-sm text-slate-400 font-mono">{vehicle.plate}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${vehicle.isActive
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-slate-700/30 text-slate-500'
                      }`}
                  >
                    {vehicle.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                <div className="mb-4 text-sm">
                  <div className="text-slate-500">Tipo</div>
                  <div className="text-white">{vehicle.type}</div>
                  <div className="text-slate-500 mt-2">Empresa</div>
                  <div className="text-white">{vehicle.companyName}</div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEdit(vehicle)}
                    variant="outline"
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    onClick={() => handleToggleActive(vehicle)}
                    variant="outline"
                    className={`flex-1 border-slate-700 ${vehicle.isActive
                        ? 'text-rose-400 hover:bg-rose-900/20'
                        : 'text-emerald-400 hover:bg-emerald-900/20'
                      }`}
                  >
                    {vehicle.isActive ? 'Inativar' : 'Ativar'}
                  </Button>
                </div>
              </Card>
            ))}

            {filteredVehicles.length === 0 && (
              <Card className="col-span-full p-8 bg-slate-900/50 backdrop-blur-sm border-slate-800/50 text-center">
                <Bus className="h-12 w-12 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400">Nenhum veículo encontrado</p>
              </Card>
            )}
          </div>
        )}

        {/* LISTA EM TABELA */}
        {viewMode === "list" && (
          <div className="border border-slate-800 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="p-2 text-left">Número</th>
                  <th className="p-2 text-left">Placa</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Empresa</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-b border-slate-800">
                    <td className="p-2">{vehicle.number}</td>
                    <td className="p-2">{vehicle.plate}</td>
                    <td className="p-2">{vehicle.type}</td>
                    <td className="p-2">{vehicle.companyName}</td>
                    <td className="p-2">
                      {vehicle.isActive ? (
                        <span className="text-emerald-400">Ativo</span>
                      ) : (
                        <span className="text-rose-400">Inativo</span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                          onClick={() => handleEdit(vehicle)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`border-slate-700 ${vehicle.isActive
                              ? 'text-rose-400 hover:bg-rose-900/20'
                              : 'text-emerald-400 hover:bg-emerald-900/20'
                            }`}
                          onClick={() => handleToggleActive(vehicle)}
                        >
                          {vehicle.isActive ? 'Inativar' : 'Ativar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredVehicles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-400">
                      Nenhum veículo encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
