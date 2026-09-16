const { v4: uuidv4 } = require('uuid');
const db = require('../db');

/**
 * Reusable helper to authorize action access through its parent document.
 * Joins contract_actions and documents to guarantee authorization boundary.
 */
async function authorizeAction(actionId, user) {
  if (!actionId) {
    return { errorStatus: 400, errorMessage: 'Action ID is required' };
  }
  const { rows } = await db.query(
    `SELECT 
       a.id, a.document_id, a.intelligence_snapshot_id, a.source_action_id,
       a.title, a.category, a.priority_score, a.status,
       d.user_id AS doc_owner_id
     FROM contract_actions a
     JOIN documents d ON d.id = a.document_id
     WHERE a.id = $1`,
    [actionId]
  );
  if (rows.length === 0) {
    return { errorStatus: 404, errorMessage: 'Action not found' };
  }
  const action = rows[0];
  if (action.doc_owner_id !== user.id && user.role !== 'admin') {
    return { errorStatus: 403, errorMessage: 'Unauthorized access to action' };
  }
  return { action };
}

/**
 * Retrieves all comments for an action, organized into a clean 1-level threaded discussion hierarchy.
 * Masks deleted comments while preserving thread structure and replies.
 */
async function getCommentsByAction(actionId, user) {
  const authCheck = await authorizeAction(actionId, user);
  if (authCheck.errorStatus) {
    return authCheck;
  }

  const { rows } = await db.query(
    `SELECT 
       c.id, c.action_id, c.parent_comment_id, c.author_id,
       c.body, c.context_references, c.created_at, c.updated_at, c.deleted_at,
       u.name AS author_name, u.email AS author_email, u.role AS author_role
     FROM contract_action_comments c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.action_id = $1
     ORDER BY c.created_at ASC`,
    [actionId]
  );

  // Map raw DB rows to safe comment objects
  const mappedComments = rows.map((row) => {
    const isDeleted = Boolean(row.deleted_at);
    const createdAtTime = new Date(row.created_at).getTime();
    const updatedAtTime = row.updated_at ? new Date(row.updated_at).getTime() : createdAtTime;
    const isEdited = !isDeleted && updatedAtTime > createdAtTime + 1000;

    return {
      id: row.id,
      actionId: row.action_id,
      parentCommentId: row.parent_comment_id,
      body: isDeleted ? 'This comment was deleted.' : row.body,
      contextReferences: row.context_references || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      isDeleted,
      isEdited,
      author: row.author_id
        ? {
            id: row.author_id,
            name: row.author_name || 'Team Member',
            email: row.author_email || '',
            role: row.author_role || 'user'
          }
        : {
            id: null,
            name: 'Deleted User',
            email: '',
            role: 'user'
          },
      replies: []
    };
  });

  // Organize into top-level comments and 1-level replies
  const commentMap = new Map();
  const topLevelComments = [];

  mappedComments.forEach((c) => {
    commentMap.set(c.id, c);
  });

  mappedComments.forEach((c) => {
    if (c.parentCommentId && commentMap.has(c.parentCommentId)) {
      const parent = commentMap.get(c.parentCommentId);
      parent.replies.push(c);
    } else {
      topLevelComments.push(c);
    }
  });

  return {
    comments: topLevelComments,
    totalCount: mappedComments.length,
    activeCount: mappedComments.filter((c) => !c.isDeleted).length
  };
}

/**
 * Creates a new comment or reply associated with a workflow action.
 * Author identity is derived strictly from the authenticated JWT user.
 */
async function createComment(actionId, payload = {}, user) {
  const authCheck = await authorizeAction(actionId, user);
  if (authCheck.errorStatus) {
    return authCheck;
  }

  const { body, parentCommentId, contextReferences } = payload;

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return {
      errorStatus: 400,
      errorMessage: 'Comment body cannot be empty or whitespace-only.'
    };
  }

  const trimmedBody = body.trim();

  // Validate parent comment if provided
  if (parentCommentId) {
    const { rows: parentRows } = await db.query(
      `SELECT id, action_id FROM contract_action_comments WHERE id = $1`,
      [parentCommentId]
    );

    if (parentRows.length === 0) {
      return {
        errorStatus: 400,
        errorMessage: 'Parent comment not found.'
      };
    }

    if (parentRows[0].action_id !== actionId) {
      return {
        errorStatus: 400,
        errorMessage: 'Parent comment belongs to a different action.'
      };
    }
  }

  const commentId = uuidv4();
  const safeContext = contextReferences && typeof contextReferences === 'object' ? contextReferences : {};

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: insertedRows } = await client.query(
      `INSERT INTO contract_action_comments (
         id, action_id, parent_comment_id, author_id, body, context_references, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [commentId, actionId, parentCommentId || null, user.id, trimmedBody, JSON.stringify(safeContext)]
    );

    await client.query(
      `INSERT INTO contract_action_activity (
         id, action_id, event_type, actor_id, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        uuidv4(),
        actionId,
        'COMMENT_CREATED',
        user.id,
        JSON.stringify({
          commentId,
          actionId,
          parentCommentId: parentCommentId || null
        })
      ]
    );

    await client.query('COMMIT');

    const created = insertedRows[0];
    return {
      comment: {
        id: created.id,
        actionId: created.action_id,
        parentCommentId: created.parent_comment_id,
        body: created.body,
        contextReferences: created.context_references,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
        deletedAt: null,
        isDeleted: false,
        isEdited: false,
        author: {
          id: user.id,
          name: user.name || 'Team Member',
          email: user.email || '',
          role: user.role || 'user'
        },
        replies: []
      }
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Edits an existing comment's body.
 * Restricted to the comment author or an administrator.
 */
async function editComment(actionId, commentId, payload = {}, user) {
  const authCheck = await authorizeAction(actionId, user);
  if (authCheck.errorStatus) {
    return authCheck;
  }

  if (!commentId) {
    return { errorStatus: 400, errorMessage: 'Comment ID is required' };
  }

  const { body } = payload;
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return {
      errorStatus: 400,
      errorMessage: 'Updated comment body cannot be empty.'
    };
  }

  const trimmedBody = body.trim();

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT c.*, u.name AS author_name, u.email AS author_email, u.role AS author_role
       FROM contract_action_comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.id = $1
       FOR UPDATE OF c`,
      [commentId]
    );

    if (rows.length === 0 || rows[0].action_id !== actionId) {
      await client.query('ROLLBACK');
      return { errorStatus: 404, errorMessage: 'Comment not found for this action.' };
    }

    const comment = rows[0];

    if (comment.deleted_at) {
      await client.query('ROLLBACK');
      return { errorStatus: 400, errorMessage: 'Cannot edit a deleted comment.' };
    }

    // Authorization check
    if (comment.author_id !== user.id && user.role !== 'admin') {
      await client.query('ROLLBACK');
      return { errorStatus: 403, errorMessage: 'You are not authorized to edit this comment.' };
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE contract_action_comments
       SET body = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [trimmedBody, commentId]
    );

    await client.query(
      `INSERT INTO contract_action_activity (
         id, action_id, event_type, actor_id, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        uuidv4(),
        actionId,
        'COMMENT_EDITED',
        user.id,
        JSON.stringify({
          commentId,
          actionId
        })
      ]
    );

    await client.query('COMMIT');

    const updated = updatedRows[0];
    return {
      success: true,
      comment: {
        id: updated.id,
        actionId: updated.action_id,
        parentCommentId: updated.parent_comment_id,
        body: updated.body,
        contextReferences: updated.context_references,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        deletedAt: null,
        isDeleted: false,
        isEdited: true,
        author: {
          id: comment.author_id,
          name: comment.author_name || 'Team Member',
          email: comment.author_email || '',
          role: comment.author_role || 'user'
        }
      }
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Soft deletes a comment. Preserves DB row, thread chronology, and replies.
 */
async function softDeleteComment(actionId, commentId, user) {
  const authCheck = await authorizeAction(actionId, user);
  if (authCheck.errorStatus) {
    return authCheck;
  }

  if (!commentId) {
    return { errorStatus: 400, errorMessage: 'Comment ID is required' };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM contract_action_comments WHERE id = $1 FOR UPDATE`,
      [commentId]
    );

    if (rows.length === 0 || rows[0].action_id !== actionId) {
      await client.query('ROLLBACK');
      return { errorStatus: 404, errorMessage: 'Comment not found for this action.' };
    }

    const comment = rows[0];

    // Authorization check
    if (comment.author_id !== user.id && user.role !== 'admin') {
      await client.query('ROLLBACK');
      return { errorStatus: 403, errorMessage: 'You are not authorized to delete this comment.' };
    }

    if (comment.deleted_at) {
      await client.query('ROLLBACK');
      return { success: true, message: 'Comment is already deleted.' };
    }

    await client.query(
      `UPDATE contract_action_comments
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [commentId]
    );

    await client.query(
      `INSERT INTO contract_action_activity (
         id, action_id, event_type, actor_id, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        uuidv4(),
        actionId,
        'COMMENT_DELETED',
        user.id,
        JSON.stringify({
          commentId,
          actionId
        })
      ]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Comment deleted successfully.'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  authorizeAction,
  getCommentsByAction,
  createComment,
  editComment,
  softDeleteComment
};
