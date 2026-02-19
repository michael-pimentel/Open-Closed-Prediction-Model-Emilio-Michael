import { getPlaceDetails } from "../../../lib/api";
import ResultCard from "../../../components/ResultCard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function PlacePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    let place = null;
    let fetchError = false;

    try {
        place = await getPlaceDetails(id);
    } catch {
        fetchError = true;
    }

    if (fetchError) {
        return (
            <div className="w-full flex py-24 justify-center">
                <div className="text-center font-bold text-rose-500 bg-rose-50 border border-rose-200 px-8 py-6 rounded-2xl w-full max-w-md">
                    Failed to load place details. The API might be offline.
                </div>
            </div>
        );
    }

    if (!place) {
        return (
            <div className="w-full flex justify-center items-center py-24">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Place not found</h2>
                    <Link href="/" className="text-emerald-600 hover:underline">
                        Go back home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16 flex flex-col items-center">
            <div className="w-full max-w-2xl mb-8">
                <Link href="/" className="inline-flex items-center text-gray-400 hover:text-gray-800 transition-colors text-sm font-semibold uppercase tracking-widest">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Search
                </Link>
            </div>
            <ResultCard data={place} />
        </div>
    );
}
