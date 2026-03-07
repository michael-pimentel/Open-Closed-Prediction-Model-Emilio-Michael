import { create } from 'zustand';
import type { SearchResultType } from '@/components/SearchResults';

export interface CityAnalysisState {
    cityName: string | null;
    isAnalyzing: boolean;
    progress: number;
    results: SearchResultType[];
    error: string | null;
    cityBoundary: object | null;

    // Actions
    startAnalysis: (cityName: string) => void;
    addResults: (newResults: SearchResultType[]) => void;
    setProgress: (progress: number) => void;
    finishAnalysis: () => void;
    setError: (error: string) => void;
    setCityBoundary: (boundary: object | null) => void;
    reset: () => void;
}

export const useCityStore = create<CityAnalysisState>((set) => ({
    cityName: null,
    isAnalyzing: false,
    progress: 0,
    results: [],
    error: null,
    cityBoundary: null,

    startAnalysis: (cityName) => set({
        cityName,
        isAnalyzing: true,
        progress: 0,
        results: [],
        error: null,
        cityBoundary: null,
    }),

    addResults: (newResults) => set((state) => ({
        results: [...state.results, ...newResults]
    })),

    setProgress: (progress) => set({ progress }),

    finishAnalysis: () => set({ isAnalyzing: false, progress: 100 }),

    setError: (error) => set({ error, isAnalyzing: false }),

    setCityBoundary: (boundary) => set({ cityBoundary: boundary }),

    reset: () => set({
        cityName: null,
        isAnalyzing: false,
        progress: 0,
        results: [],
        error: null,
        cityBoundary: null,
    }),
}));
