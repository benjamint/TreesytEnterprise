import type { Warehouse } from '@/types';
import { defineStore } from './persistence';

export const useWarehouseStore = defineStore('warehouses', { warehouses: [] as Warehouse[] }, (s) => ({ warehouses: s.warehouses }), () => ({}));
