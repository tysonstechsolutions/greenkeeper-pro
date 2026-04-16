"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, Plus, Search, X, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

interface Vendor {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  category: string;
  supplies: string | null;
  notes: string | null;
  contract_end_date: string | null;
}

const CATEGORIES = [
  { value: "spray_contractor", label: "Spray Contractor" },
  { value: "equipment_dealer", label: "Equipment Dealer" },
  { value: "parts_supplier", label: "Parts Supplier" },
  { value: "irrigation", label: "Irrigation" },
  { value: "landscaping", label: "Landscaping" },
  { value: "construction", label: "Construction" },
  { value: "fuel", label: "Fuel" },
  { value: "seed_sod", label: "Seed / Sod" },
  { value: "general", label: "General" },
] as const;

const categoryColors: Record<string, string> = {
  spray_contractor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  equipment_dealer: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  parts_supplier: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  irrigation: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  landscaping: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  construction: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  fuel: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  seed_sod: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

function categoryLabel(cat: string) {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

export default function VendorsPage() {
  const { user, isSuper, isAsstSuper, isDirector, isForeman, isGM } = useAuth();
  const canManage = isSuper || isAsstSuper || isDirector || isForeman || isGM;

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "", company: "", phone: "", email: "",
    category: "general", supplies: "", notes: "",
  });

  const fetchVendors = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("vendors")
      .select("id, name, company, phone, email, category, supplies, notes, contract_end_date")
      .order("name");
    if (data) setVendors(data);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !user) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("vendors").insert({
      name: form.name.trim(),
      company: form.company.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      category: form.category,
      supplies: form.supplies.trim() || null,
      notes: form.notes.trim() || null,
      created_by: user.id,
    });
    setSaving(false);
    if (!error) {
      setForm({ name: "", company: "", phone: "", email: "", category: "general", supplies: "", notes: "" });
      setShowForm(false);
      fetchVendors();
    }
  }

  const filtered = vendors.filter((v) => {
    if (filterCat !== "all" && v.category !== filterCat) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.company?.toLowerCase().includes(q) ||
      v.supplies?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <PageHeader title="Vendors" icon={Phone} description="Contact directory">
        {canManage && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <X className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            {showForm ? "Cancel" : "Add"}
          </Button>
        )}
      </PageHeader>

      {/* ── Inline Add Form ── */}
      {showForm && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="v-name">Name *</Label>
                <Input id="v-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contact name" required />
              </div>
              <div>
                <Label htmlFor="v-company">Company</Label>
                <Input id="v-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="v-phone">Phone</Label>
                  <Input id="v-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
                </div>
                <div>
                  <Label htmlFor="v-email">Email</Label>
                  <Input id="v-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="v-supplies">Supplies / Services</Label>
                <Input id="v-supplies" value={form.supplies} onChange={(e) => setForm({ ...form, supplies: e.target.value })} placeholder="What they provide" />
              </div>
              <div>
                <Label htmlFor="v-notes">Notes</Label>
                <Textarea id="v-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Additional notes" />
              </div>
              <Button type="submit" className="w-full" disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Save Vendor
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Search & Filter ── */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors..."
            className="pl-9"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Vendor List ── */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          {vendors.length === 0 ? "No vendors yet. Add your first vendor above." : "No vendors match your search."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <Card key={v.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="font-semibold text-base">{v.name}</p>
                    {v.company && <p className="text-sm text-muted-foreground">{v.company}</p>}
                  </div>
                  <Badge variant="secondary" className={categoryColors[v.category] || ""}>
                    {categoryLabel(v.category)}
                  </Badge>
                </div>
                {v.supplies && (
                  <p className="text-sm text-muted-foreground mt-1">{v.supplies}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-2">
                  {v.phone && (
                    <a href={`tel:${v.phone}`} className="text-sm text-primary font-medium hover:underline">
                      {v.phone}
                    </a>
                  )}
                  {v.email && (
                    <a href={`mailto:${v.email}`} className="text-sm text-primary font-medium hover:underline">
                      {v.email}
                    </a>
                  )}
                </div>
                {v.notes && (
                  <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{v.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
