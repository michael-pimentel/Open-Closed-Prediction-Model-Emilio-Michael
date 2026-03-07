"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

interface UserLocation {
    lat: number;
    lon: number;
    displayName?: string;
}

interface AppContextType {
    userLocation: UserLocation | null;
    setUserLocation: (location: UserLocation | null) => void;
    isSearchFocused: boolean;
    setSearchFocused: (focused: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
    const [isSearchFocused, setSearchFocused] = useState(false);

    useEffect(() => {
        // Try to recover location from session or local storage if needed
        const savedLoc = localStorage.getItem('user_location');
        if (savedLoc) {
            setUserLocation(JSON.parse(savedLoc));
        }
    }, []);

    const setLocation = (loc: UserLocation | null) => {
        setUserLocation(loc);
        if (loc) {
            localStorage.setItem('user_location', JSON.stringify(loc));
        } else {
            localStorage.removeItem('user_location');
        }
    };

    return (
        <AppContext.Provider value={{
            userLocation,
            setUserLocation: setLocation,
            isSearchFocused,
            setSearchFocused
        }}>
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
}
