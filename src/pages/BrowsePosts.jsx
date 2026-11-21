import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { marked } from 'marked';
import ArchitectureDiagram from '../components/ArchitectureDiagram';

export default function BrowsePosts() {
    const { currentUser, userPlan, isTrialActive, trialExpiresAt, startFreeTrial } = useAuth();

    const [allPosts, setAllPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionMessage, setActionMessage] = useState('');

    // Filtering & Sorting
    const [selectedType, setSelectedType] = useState('All');
    const [selectedPlan, setSelectedPlan] = useState('All');
    const [tagFilter, setTagFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('newest');
    const [hiddenPostIds, setHiddenPostIds] = useState([]);

    // Modals state
    const [expandedPost, setExpandedPost] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [trialLoading, setTrialLoading] = useState(false);

    // Comments state for modal
    const [comments, setComments] = useState([]);
    const [commentText, setCommentText] = useState('');
    const [commentLoading, setCommentLoading] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    // Read initial query if arriving from Navbar (e.g., /browse?q=react)
    useEffect(() => {
        const queryParam = searchParams.get('q');
        if (queryParam) {
            setSearchTerm(queryParam);
        }
    }, [searchParams]);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`/api/posts?userPlan=${userPlan}`);
            const data = await response.json();
            if (response.ok && data.success) {
                setAllPosts(data.posts || []);
            } else {
                setError(data.message || 'Failed to load posts from server.');
            }
        } catch (err) {
            console.error(err);
            setError('Could not connect to backend server on port 5000.');
        } finally {
            setLoading(false);
        }
    }, [userPlan]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // Load comments whenever a post is opened in modal
    const fetchComments = async (postId) => {
        try {
            const res = await fetch(`/api/posts/${postId}/comments`);
            const data = await res.json();
            if (res.ok && data.success) {
                setComments(data.comments || []);
            }
        } catch (err) {
            console.error('Failed to load comments:', err);
        }
    };

    const handleOpenPost = (post) => {
        setExpandedPost(post);
        setComments([]);
        fetchComments(post.id);
    };

    // Add Comment / Answer
    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!currentUser) return alert('Please sign in to leave a reply.');
        if (!commentText.trim()) return;

        setCommentLoading(true);
        try {
            const res = await fetch(`/api/posts/${expandedPost.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.uid,
                    authorName: currentUser.displayName || currentUser.email.split('@')[0],
                    text: commentText.trim(),
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setComments((prev) => [...prev, { id: data.id, ...data.comment }]);
                setCommentText('');
            } else {
                alert(data.message || 'Failed to post comment.');
            }
        } catch (err) {
            alert('Error submitting comment.');
        } finally {
            setCommentLoading(false);
        }
    };

    // Toggle Solution checkmark (Question Author only)
    const handleToggleSolution = async (commentId) => {
        if (!currentUser || currentUser.uid !== expandedPost.userId) return;

        try {
            const res = await fetch(`/api/posts/${expandedPost.id}/comments/${commentId}/solution`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.uid }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setComments((prev) =>
                    prev.map((c) => (c.id === commentId ? { ...c, isSolution: data.isSolution } : c))
                );
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Trigger 7-Day Trial
    const handleActivateTrial = async () => {
        setTrialLoading(true);
        try {
            await startFreeTrial();
            setActionMessage('Congratulations! Your 7-Day Paid Tier trial has been activated.');
            setTimeout(() => setActionMessage(''), 5000);
            fetchPosts();
        } catch (err) {
            alert(err.message);
        } finally {
            setTrialLoading(false);
        }
    };

    // Author Verification
    const isPostAuthor = useCallback(
        (post) => {
            if (!currentUser) return false;
            if (post.userId && post.userId === currentUser.uid) return true;
            const currentName = (currentUser.displayName || currentUser.email || '').toLowerCase().trim();
            const authorName = (post.authorName || '').toLowerCase().trim();
            if (authorName && (currentName === authorName || currentName.includes(authorName))) return true;
            if (!post.userId && authorName === 'kashitaa') return true;
            return false;
        },
        [currentUser]
    );

    const handleHideTemporarily = useCallback((id, e) => {
        if (e) e.stopPropagation();
        setHiddenPostIds((prev) => [...prev, id]);
        setActionMessage('Post hidden temporarily from view. Click "Reset" to restore.');
        setTimeout(() => setActionMessage(''), 3000);
    }, []);

    const triggerDeleteDialog = useCallback((post, e) => {
        if (e) e.stopPropagation();
        setDeleteTarget(post);
    }, []);

    const confirmPermanentDelete = async () => {
        if (!deleteTarget || !currentUser) return;
        setDeleting(true);
        try {
            const response = await fetch(
                `/api/posts/${deleteTarget.id}?userId=${encodeURIComponent(
                    currentUser.uid
                )}&authorName=${encodeURIComponent(currentUser.displayName || '')}`,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: currentUser.uid,
                        authorName: currentUser.displayName || '',
                    }),
                }
            );

            const data = await response.json();
            if (response.ok && data.success) {
                setAllPosts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
                if (expandedPost?.id === deleteTarget.id) setExpandedPost(null);
                setDeleteTarget(null);
                setActionMessage(`"${deleteTarget.title}" permanently deleted.`);
                setTimeout(() => setActionMessage(''), 3500);
            } else {
                alert(data.message || 'Failed to delete post.');
            }
        } catch (err) {
            alert('Error connecting to backend server to delete post.');
        } finally {
            setDeleting(false);
        }
    };

    const handleUpvote = async (postId, e) => {
        if (e) e.stopPropagation();
        if (!currentUser) {
            alert('Please log in to vote.');
            return;
        }

        try {
            const res = await fetch(`/api/posts/${postId}/vote`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.uid }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setAllPosts((prevPosts) =>
                    prevPosts.map((p) =>
                        p.id === postId
                            ? {
                                ...p,
                                votes: (p.votes || 0) + 1,
                                votedBy: [...(p.votedBy || []), currentUser.uid],
                            }
                            : p
                    )
                );
                if (expandedPost?.id === postId) {
                    setExpandedPost((prev) => ({
                        ...prev,
                        votes: (prev.votes || 0) + 1,
                        votedBy: [...(prev.votedBy || []), currentUser.uid],
                    }));
                }
            } else {
                alert(data.message || 'You have already voted on this post.');
            }
        } catch (err) {
            console.error('Upvote error:', err);
        }
    };

    const handleReset = useCallback(() => {
        setSelectedType('All');
        setSelectedPlan('All');
        setTagFilter('');
        setSearchTerm('');
        setSortBy('newest');
        setHiddenPostIds([]);
        setSearchParams({}); // Clears ?q= from the URL bar
        setActionMessage('Filters reset. Temporarily hidden posts restored.');
        setTimeout(() => setActionMessage(''), 3000);
    }, [setSearchParams]);


    // useMemo for filtering
    const visiblePosts = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const tagQuery = tagFilter.trim().toLowerCase();

        const filtered = allPosts.filter((post) => {
            if (hiddenPostIds.includes(post.id)) return false;
            if (selectedType !== 'All' && post.postType !== selectedType) return false;
            if (selectedPlan !== 'All' && post.plan !== selectedPlan) return false;

            if (tagQuery) {
                const hasTag = Array.isArray(post.tags) && post.tags.some((t) => t.toLowerCase().includes(tagQuery));
                if (!hasTag) return false;
            }

            if (query) {
                const titleMatch = post.title?.toLowerCase().includes(query);
                const textMatch = post.text?.toLowerCase().includes(query);
                const abstractMatch = post.abstract?.toLowerCase().includes(query);
                if (!titleMatch && !textMatch && !abstractMatch) return false;
            }

            return true;
        });

        return filtered.sort((a, b) => {
            if (sortBy === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            if (sortBy === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            if (sortBy === 'popular') return (b.votes || 0) - (a.votes || 0);
            if (sortBy === 'alpha') return (a.title || '').localeCompare(b.title || '');
            return 0;
        });
    }, [allPosts, hiddenPostIds, selectedType, selectedPlan, tagFilter, searchTerm, sortBy]);

    const expandedHasVoted =
        expandedPost &&
        currentUser &&
        Array.isArray(expandedPost.votedBy) &&
        expandedPost.votedBy.includes(currentUser.uid);

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            {/* 7-DAY FREE TRIAL INTERACTIVE BANNER */}
            {currentUser && userPlan === 'Free' && (
                <div className="mb-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-5 rounded-xl shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                        <span className="bg-white/20 text-xs font-bold px-2 py-0.5 rounded tracking-wide uppercase">
                            Limited Offer
                        </span>
                        <h2 className="text-lg font-bold mt-1">Unlock All Exclusive DEV@Deakin Posts for 7 Days</h2>
                        <p className="text-xs text-blue-100">
                            Experience the full Paid Tier without entering any payment info. Instant access to exclusive articles and publishing tools.
                        </p>
                    </div>
                    <button
                        onClick={handleActivateTrial}
                        disabled={trialLoading}
                        className="whitespace-nowrap bg-amber-400 hover:bg-amber-300 text-gray-900 text-xs font-bold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-50"
                    >
                        {trialLoading ? 'Activating...' : 'Start 7-Day Free Trial'}
                    </button>
                </div>
            )}

            {/* Trial Expiry Notice */}
            {isTrialActive && trialExpiresAt && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded text-xs flex items-center justify-between">
                    <span>
                        ⭐️ You are on an active <strong>7-Day Paid Trial</strong>. Valid until:{' '}
                        {new Date(trialExpiresAt).toLocaleDateString()}
                    </span>
                    <Link to="/pricing" className="underline font-bold hover:text-amber-700">
                        Keep Paid Forever
                    </Link>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-200 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Browse Posts</h1>
                    <p className="text-sm text-gray-500">
                        Viewing content as a{' '}
                        <span className={`font-semibold ${userPlan === 'Paid' ? 'text-amber-600' : 'text-gray-700'}`}>
                            {userPlan} Tier
                        </span>{' '}
                        reader. {userPlan === 'Free' && 'Upgrade to Paid in Pricing to unlock exclusive posts!'}
                    </p>
                </div>
            </div>

            {actionMessage && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded text-xs font-medium">
                    {actionMessage}
                </div>
            )}

            {/* Filter Toolbar */}
            <div className="my-5 bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-wrap items-center gap-4 text-sm">
                <div className="flex-1 min-w-[200px]">
                    <input
                        type="text"
                        placeholder="Search title, abstract, or text..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div>
                    <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="All">All Types</option>
                        <option value="Article">Articles Only</option>
                        <option value="Question">Questions Only</option>
                    </select>
                </div>

                <div>
                    <select
                        value={selectedPlan}
                        onChange={(e) => setSelectedPlan(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="All">All Plans</option>
                        <option value="Free">Free Only</option>
                        <option value="Paid">Paid Only</option>
                    </select>
                </div>

                <div>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="popular">Most Upvoted</option>
                        <option value="alpha">Alphabetical (A-Z)</option>
                    </select>
                </div>

                <button
                    onClick={handleReset}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-4 py-1.5 rounded transition"
                >
                    Reset
                </button>
            </div>

            {loading && <p className="text-center py-12 text-gray-500 text-sm">Loading posts from backend...</p>}
            {error && <div className="p-4 bg-red-100 text-red-700 rounded text-sm mb-6">{error}</div>}

            {!loading && !error && (
                <>
                    {visiblePosts.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-lg border border-dashed border-gray-300">
                            <p className="text-gray-500 text-sm">No posts found matching your criteria.</p>
                            <button onClick={handleReset} className="mt-3 text-blue-600 text-xs hover:underline">
                                Reset all filters & unhide posts
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {visiblePosts.map((post) => {
                                const canDelete = isPostAuthor(post);
                                const hasVoted = currentUser && Array.isArray(post.votedBy) && post.votedBy.includes(currentUser.uid);

                                return (
                                    <div
                                        key={post.id}
                                        onClick={() => handleOpenPost(post)}
                                        className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between relative group"
                                    >
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <span
                                                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${post.plan === 'Paid'
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                        : 'bg-teal-50 text-teal-700 border border-teal-200'
                                                        }`}
                                                >
                                                    {post.plan} {post.postType}
                                                </span>

                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={(e) => handleUpvote(post.id, e)}
                                                        disabled={hasVoted}
                                                        className={`px-3 py-1 rounded text-xs font-semibold border transition ${hasVoted
                                                            ? 'bg-blue-100 text-blue-700 border-blue-300 cursor-not-allowed'
                                                            : 'bg-gray-100 hover:bg-blue-50 text-gray-700 border-gray-300'
                                                            }`}
                                                    >
                                                        {hasVoted ? `▲ Voted (${post.votes || 0})` : `▲ Upvote (${post.votes || 0})`}
                                                    </button>

                                                    <button
                                                        onClick={(e) => handleHideTemporarily(post.id, e)}
                                                        title="Hide temporarily"
                                                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300 px-2 py-0.5 rounded transition"
                                                    >
                                                        Hide
                                                    </button>

                                                    {canDelete && (
                                                        <button
                                                            onClick={(e) => triggerDeleteDialog(post, e)}
                                                            title="Delete permanently"
                                                            className="text-xs bg-red-100 hover:bg-red-600 hover:text-white text-red-700 border border-red-300 px-2 py-0.5 rounded font-semibold transition"
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <h3 className="text-base font-bold text-gray-800 mb-1.5 line-clamp-1 group-hover:text-blue-600">
                                                {post.title}
                                            </h3>

                                            <p className="text-xs text-gray-600 mb-3 line-clamp-3">
                                                {post.abstract || post.text}
                                            </p>

                                            {post.diagram && (
                                                <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                                                    <ArchitectureDiagram
                                                        syntax={post.diagram}
                                                        theme={post.diagramTheme || 'blue'}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="border-t pt-3 mt-2 flex flex-col gap-2 text-[11px] text-gray-500">
                                            {Array.isArray(post.tags) && post.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {post.tags.map((tag, idx) => (
                                                        <span key={idx} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between pt-1">
                                                <span className={canDelete ? 'font-bold text-blue-700' : ''}>
                                                    By {post.authorName || 'Anonymous'} {canDelete && '(You)'}
                                                </span>
                                                <span>{post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ''}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* EXPANDED MODAL WITH MARKDOWN CONTENT AND COMMENT THREAD */}
            {expandedPost && (
                <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
                        <button
                            onClick={() => setExpandedPost(null)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-lg font-bold"
                        >
                            ✕
                        </button>

                        {/* Header info */}
                        <div className="flex items-center justify-between mb-3 pr-8">
                            <div className="flex items-center space-x-2">
                                <span
                                    className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${expandedPost.plan === 'Paid' ? 'bg-amber-100 text-amber-800' : 'bg-teal-50 text-teal-700'
                                        }`}
                                >
                                    {expandedPost.plan} {expandedPost.postType}
                                </span>
                                <span className="text-xs text-gray-400">
                                    • {expandedPost.createdAt ? new Date(expandedPost.createdAt).toLocaleDateString() : ''}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                {isPostAuthor(expandedPost) && (
                                    <button
                                        onClick={() => triggerDeleteDialog(expandedPost)}
                                        className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1 rounded transition"
                                    >
                                        Delete Permanently
                                    </button>
                                )}

                                <button
                                    onClick={(e) => handleUpvote(expandedPost.id, e)}
                                    disabled={expandedHasVoted}
                                    className={`px-3 py-1 rounded text-xs font-semibold border transition ${expandedHasVoted
                                        ? 'bg-blue-100 text-blue-700 border-blue-300 cursor-not-allowed'
                                        : 'bg-gray-100 hover:bg-blue-50 text-gray-700 border-gray-300'
                                        }`}
                                >
                                    {expandedHasVoted ? `▲ Voted (${expandedPost.votes || 0})` : `▲ Upvote (${expandedPost.votes || 0})`}
                                </button>
                            </div>
                        </div>

                        <h2 className="text-2xl font-bold text-gray-900 mb-1">{expandedPost.title}</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            Authored by <span className="font-semibold text-gray-700">{expandedPost.authorName || 'Anonymous'}</span>
                        </p>

                        {/* Abstract */}
                        {expandedPost.abstract && (
                            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 my-3 text-xs text-blue-900 italic">
                                {expandedPost.abstract}
                            </div>
                        )}

                        {/* Image */}
                        {expandedPost.image && (
                            <img
                                src={expandedPost.image}
                                alt={expandedPost.title}
                                className="w-full max-h-80 object-cover rounded-md my-4 border border-gray-200"
                            />
                        )}

                        {/* Markdown Body */}
                        <div
                            className="text-sm text-gray-800 leading-relaxed my-5 prose prose-sm max-w-none border-b pb-6"
                            dangerouslySetInnerHTML={{
                                __html: marked.parse(expandedPost.text || ''),
                            }}
                        />

                        {/* Interactive Architecture & Dependency Flowchart */}
                        {expandedPost.diagram && (
                            <div className="my-5">
                                <ArchitectureDiagram
                                    syntax={expandedPost.diagram}
                                    theme={expandedPost.diagramTheme || 'blue'}
                                />
                            </div>
                        )}

                        {/* Tags */}
                        {expandedPost.tags && expandedPost.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-6">
                                {expandedPost.tags.map((tag, idx) => (
                                    <span key={idx} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded font-medium">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* INTERACTIVE COMMENTS / ANSWERS SECTION */}
                        <div className="mt-8 border-t pt-6">
                            <h3 className="text-base font-bold text-gray-800 mb-3">
                                {expandedPost.postType === 'Question' ? 'Answers & Solutions' : 'Discussion & Feedback'} ({comments.length})
                            </h3>

                            {/* Add Comment Form */}
                            <form onSubmit={handleAddComment} className="mb-6">
                                <textarea
                                    rows={2}
                                    required
                                    placeholder={
                                        currentUser
                                            ? expandedPost.postType === 'Question'
                                                ? 'Write an answer or propose a solution...'
                                                : 'Share your perspective on this article...'
                                            : 'Please sign in to leave a response.'
                                    }
                                    disabled={!currentUser || commentLoading}
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg p-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="flex justify-end mt-2">
                                    <button
                                        type="submit"
                                        disabled={!currentUser || commentLoading || !commentText.trim()}
                                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded shadow transition disabled:opacity-50"
                                    >
                                        {commentLoading ? 'Posting...' : expandedPost.postType === 'Question' ? 'Post Answer' : 'Post Comment'}
                                    </button>
                                </div>
                            </form>

                            {/* Comments Thread List */}
                            <div className="space-y-3">
                                {comments.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No responses yet. Be the first to reply!</p>
                                ) : (
                                    comments.map((comment) => (
                                        <div
                                            key={comment.id}
                                            className={`p-3.5 rounded-lg border text-xs transition ${comment.isSolution ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-gray-50 border-gray-200'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="font-bold text-gray-800">{comment.authorName}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-gray-400">
                                                        {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ''}
                                                    </span>

                                                    {/* Question Author Solution Toggle */}
                                                    {expandedPost.postType === 'Question' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleSolution(comment.id)}
                                                            disabled={currentUser?.uid !== expandedPost.userId}
                                                            className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${comment.isSolution
                                                                ? 'bg-emerald-600 text-white'
                                                                : currentUser?.uid === expandedPost.userId
                                                                    ? 'bg-gray-200 hover:bg-emerald-100 text-gray-700'
                                                                    : 'hidden'
                                                                }`}
                                                        >
                                                            {comment.isSolution ? '✓ Accepted Solution' : 'Mark Solution'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                            ⚠️
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Post Permanently?</h3>
                        <p className="text-xs text-gray-600 mb-6 leading-relaxed">
                            Are you sure you want to delete <span className="font-semibold text-gray-800">"{deleteTarget.title}"</span>?
                            This will permanently remove it from the database and cannot be undone.
                        </p>
                        <div className="flex justify-center space-x-3">
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => setDeleteTarget(null)}
                                className="px-5 py-2 text-xs font-semibold rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                            >
                                No, Cancel
                            </button>
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={confirmPermanentDelete}
                                className="px-5 py-2 text-xs font-semibold rounded bg-red-600 hover:bg-red-700 text-white shadow transition disabled:opacity-50"
                            >
                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}