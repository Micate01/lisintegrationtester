import { startGenericAdapter } from './hl7-generic';
import { startMindrayBS200Adapter } from './adapters/mindrayBS200Adapter';
import { startMedconnAdapter } from './adapters/medconnAdapter';

const activeAdapters = new Map<number, any>();

export function startAdapter(port: number, equipmentId: number, model: string) {
  stopAdapter(equipmentId);
  let server;
  if (model && (model.toLowerCase().includes('bs-200') || model.toLowerCase().includes('bs200'))) {
    console.log(`Starting Mindray BS-200 adapter for equipment ${equipmentId}`);
    server = startMindrayBS200Adapter(port, equipmentId);
  } else if (model && model.toLowerCase().includes('medconn')) {
    console.log(`Starting Medconn adapter for equipment ${equipmentId}`);
    server = startMedconnAdapter(port, equipmentId);
  } else {
    console.log(`Starting Generic adapter for equipment ${equipmentId}`);
    server = startGenericAdapter(port, equipmentId);
  }
  if (server) activeAdapters.set(equipmentId, server);
  return server;
}

export function stopAdapter(equipmentId: number) {
  const server = activeAdapters.get(equipmentId);
  if (server) {
    server.close(() => {
      console.log(`Adapter for equipment ${equipmentId} stopped`);
    });
    activeAdapters.delete(equipmentId);
  }
}
