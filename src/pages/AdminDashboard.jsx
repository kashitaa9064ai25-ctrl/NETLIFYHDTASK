import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function AdminDashboard() {
    const { currentUser } = useAuth();

    const [analytics, setAnalytics] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionNotice, setActionNotice] = useState('');

    const fetchAdminData = useCallback(async () => {
        if (!currentUser?.uid) return;
        setLoading(true);
        setError('');

        try {
            // Fetch Analytics
            const analyticsRes = await fetch('http://localhost:5000/api/admin/analytics', {
                headers: { 'x-admin-userid': currentUser.uid },
            });
            const analyticsData = await analyticsRes.json();

            if (!analyticsRes.ok || !analyticsData.success) {
                setError(analyticsData.message || 'Access denied: Admin credentials required.');
                setLoading(false);
                return;
            }
            setAnalytics(analyticsData.analytics);

            // Fetch Posts for Moderation
            const postsRes = await fetch('http://localhost:5000/api/posts?userPlan=Paid');
            const postsData = await postsRes.json();
            if (postsRes.ok && postsData.success) {
                setPosts(postsData.posts || []);
            }
        } catch (err) {
            setError('Failed to connect to administrative API.');
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    useEffect(() => {
        fetchAdminData();
    }, [fetchAdminData]);

    // Admin Force Deletion (Overrides author ownership)
    const handleAdminDelete = async (postId, postTitle) => {
        const confirmed = window.confirm(`ADMIN ACTION: Permanently remove "${postTitle}" from the platform?`);
        if (!confirmed) return;

        try {
            const res = await fetch(`http://localhost:5000/api/admin/posts/${postId}`, {
                method: 'DELETE',
                headers: { 'x-admin-userid': currentUser.uid },
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setPosts((prev) => prev.filter((p) => p.id !== postId));
                setActionNotice(`Post "${postTitle}" was removed by administrator.`);
                setTimeout(() => setActionNotice(''), 4000);
                // Refresh metrics
                fetchAdminData();
            } else {
                alert(data.message || 'Failed to remove post.');
            }
        } catch (err) {
            alert('Error contacting moderation server.');
        }
    };

    if (loading) {
        return <div className="text-center py-20 text-gray-500 text-sm">Loading Administrative Insights...</div>;
    }

    if (error) {
        return (
            <div className="max-w-xl mx-auto my-16 p-8 bg-white border border-red-200 rounded-xl shadow-sm text-center">
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                    ✕
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-2">Restricted Area</h2>
                <p className="text-xs text-gray-600 mb-6">{error}</p>
                <Link to="/browse" className="text-xs font-bold text-blue-600 hover:underline">
                    ← Return to Browse Posts
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            {/* Title */}
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-200 gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Platform Administration & Analytics</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Real-time platform metrics, engagement trends, and content moderation queue.
                    </p>
                </div>
                <span className="self-start md:self-auto px-3 py-1 bg-purple-100 text-purple-800 font-bold text-xs rounded-full uppercase">
                    Administrator Role
                </span>
            </div>

            {actionNotice && (
                <div className="mb-6 p-3 bg-green-50 border border-green-200 text-green-800 rounded text-xs font-semibold">
                    {actionNotice}
                </div>
            )}

            {/* METRIC CARDS GRID */}
            {analytics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Posts</span>
                        <div className="text-2xl font-extrabold text-gray-800 mt-1">{analytics.totalPosts}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                            {analytics.articlesCount} Articles • {analytics.questionsCount} Questions
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Registered Users</span>
                        <div className="text-2xl font-extrabold text-blue-600 mt-1">{analytics.totalUsers}</div>
                        <div className="text-[11px] text-gray-500 mt-1">{analytics.twoFactorUsers} Users with 2FA Enabled</div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Paid Tier Members</span>
                        <div className="text-2xl font-extrabold text-amber-600 mt-1">{analytics.paidSubscribers}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                            {analytics.paidPostsCount} Exclusive Paid Posts
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Community Upvotes</span>
                        <div className="text-2xl font-extrabold text-emerald-600 mt-1">{analytics.totalVotes}</div>
                        <div className="text-[11px] text-gray-500 mt-1">Total interactions logged</div>
                    </div>
                </div>
            )}

            {/* POPULAR TAGS ANALYTICS BAR */}
            {analytics?.topTags && analytics.topTags.length > 0 && (
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-8">
                    <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Trending Topic Tags</h3>
                    <div className="flex flex-wrap gap-2">
                        {analytics.topTags.map(([tag, count]) => (
                            <span key={tag} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium">
                                <span>#{tag}</span>
                                <span className="bg-gray-300 text-gray-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">{count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* CONTENT MODERATION QUEUE */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-800">Content Moderation Queue ({posts.length})</h3>
                    <span className="text-xs text-gray-400">Admins can remove any non-compliant post</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-600">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 uppercase font-semibold">
                            <tr>
                                <th className="py-3 px-4">Title</th>
                                <th className="py-3 px-4">Type</th>
                                <th className="py-3 px-4">Tier</th>
                                <th className="py-3 px-4">Author</th>
                                <th className="py-3 px-4">Date</th>
                                <th className="py-3 px-4 text-right">Moderation</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {posts.map((post) => (
                                <tr key={post.id} className="hover:bg-gray-50 transition">
                                    <td className="py-3 px-4 font-semibold text-gray-900 max-w-xs truncate">{post.title}</td>
                                    <td className="py-3 px-4">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-700">
                                            {post.postType}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${post.plan === 'Paid' ? 'bg-amber-100 text-amber-800' : 'bg-teal-50 text-teal-700'
                                                }`}
                                        >
                                            {post.plan}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">{post.authorName || 'Anonymous'}</td>
                                    <td className="py-3 px-4">
                                        {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            onClick={() => handleAdminDelete(post.id, post.title)}
                                            className="px-2.5 py-1 bg-red-50 hover:bg-red-600 hover:text-white text-red-700 font-bold rounded border border-red-200 text-[11px] transition"
                                        >
                                            Remove Post
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}