import SearchResults from "../../components/SearchResults";

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const { q } = await searchParams;
    const query = typeof q === 'string' ? q : '';

    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h1 className="text-2xl font-bold mb-8 text-gray-900">
                Search Results for &quot;{query}&quot;
            </h1>
            <SearchResults query={query} />
        </div>
    );
}
