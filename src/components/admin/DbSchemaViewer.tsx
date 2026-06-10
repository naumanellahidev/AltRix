import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Loader2 } from 'lucide-react';

/**
 * Fetches column metadata for all tables defined in SCHEMA_TABLES via the RPC `export_table_schema`.
 * Displays a searchable accordion where each panel corresponds to a table and lists its columns.
 */
export const DbSchemaViewer = () => {
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState<Record<string, any[]>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    const loadSchema = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('export_table_schema');
        if (error) throw error;
        // Expected data format: [{ table: 'schools', columns: [{name, type, nullable, default}] }, ...]
        const map: Record<string, any[]> = {};
        (data as any[]).forEach((t) => {
          map[t.table] = t.columns;
        });
        setSchema(map);
      } catch (e) {
        console.error('Failed to fetch DB schema', e);
      } finally {
        setLoading(false);
      }
    };
    loadSchema();
  }, []);

  const filteredTables = Object.keys(schema).filter((tbl) =>
    tbl.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="bg-zinc-950/60 backdrop-blur-sm border-amber-500/20">
      <CardHeader>
        <CardTitle className="text-amber-300">Database Schema Viewer</CardTitle>
      </CardHeader>
      <CardContent>
        <input
          type="text"
          placeholder="Search tables…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-3 p-2 rounded bg-zinc-900 text-zinc-100 border border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        ) : (
          <Accordion type="multiple" className="w-full space-y-2">
            {filteredTables.map((tbl) => (
              <AccordionItem value={tbl} key={tbl}>
                <AccordionTrigger className="text-zinc-200 hover:text-amber-300">
                  {tbl}
                </AccordionTrigger>
                <AccordionContent>
                  <table className="w-full text-xs text-zinc-300">
                    <thead className="border-b border-amber-500/30">
                      <tr>
                        <th className="text-left py-1">Column</th>
                        <th className="text-left py-1">Type</th>
                        <th className="text-left py-1">Nullable</th>
                        <th className="text-left py-1">Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schema[tbl].map((col, idx) => (
                        <tr key={idx} className="border-b border-amber-500/10">
                          <td className="py-1">{col.name}</td>
                          <td className="py-1">{col.type}</td>
                          <td className="py-1">{col.is_nullable ? 'YES' : 'NO'}</td>
                          <td className="py-1">{col.column_default || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};
