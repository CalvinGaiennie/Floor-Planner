import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFloorPlan } from '../context/FloorPlanContext'
import { findUserByEmail } from '../services/userDirectory'
import {
  acceptCollaborateRequest,
  acceptFriendRequest,
  declineCollaborateRequest,
  declineFriendRequest,
  listCollaborateRequests,
  listIncomingFriendRequests,
  listFriends,
  sendFriendRequest,
  type CollaborateRequest,
  type FriendRecord,
  type IncomingFriendRequest,
} from '../services/firestoreFriends'

export function FriendsPanel() {
  const { user } = useAuth()
  const { openFriendPlan, refreshFriendPlans, friendPlansGroups } = useFloorPlan()
  const [open, setOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [friendError, setFriendError] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<IncomingFriendRequest[]>([])
  const [collabRequests, setCollabRequests] = useState<CollaborateRequest[]>([])
  const [friends, setFriends] = useState<FriendRecord[]>([])

  const reload = useCallback(async () => {
    if (!user) return
    setIncoming(await listIncomingFriendRequests(user.uid))
    setCollabRequests(await listCollaborateRequests(user.uid))
    setFriends(await listFriends(user.uid))
    await refreshFriendPlans()
  }, [user, refreshFriendPlans])

  useEffect(() => {
    if (open && user) reload()
  }, [open, user, reload])

  const handleAddFriend = async () => {
    if (!user?.email) return
    setFriendError(null)
    const target = await findUserByEmail(emailInput)
    if (!target) {
      setFriendError('No user found with that email.')
      return
    }
    if (target.uid === user.uid) {
      setFriendError('You cannot friend yourself.')
      return
    }
    if (friends.some((f) => f.friendUid === target.uid)) {
      setFriendError('Already friends with that user.')
      return
    }
    try {
      await sendFriendRequest(
        user.uid,
        user.email ?? '',
        user.displayName ?? user.email ?? 'User',
        target.uid,
      )
      setEmailInput('')
      await reload()
    } catch {
      setFriendError('Could not send friend request.')
    }
  }

  const handleAcceptFriend = async (req: IncomingFriendRequest) => {
    if (!user?.email) return
    await acceptFriendRequest(
      user.uid,
      req.fromUid,
      req.fromEmail,
      req.fromDisplayName,
      user.email,
      user.displayName ?? user.email ?? 'User',
    )
    await reload()
  }

  if (!user) return null

  return (
    <>
      <button
        type="button"
        className="friends-panel-fab"
        aria-label="Friends"
        title="Friends"
        onClick={() => setOpen((v) => !v)}
      >
        Friends
      </button>
      {open && (
        <aside className="friends-panel" aria-label="Friends">
          <div className="friends-panel-header">
            <h2>Friends</h2>
            <button type="button" className="friends-panel-close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <div className="friends-panel-section">
            <label className="friends-panel-label">
              <span>Add by email</span>
              <input
                type="email"
                value={emailInput}
                placeholder="friend@example.com"
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </label>
            <button type="button" onClick={handleAddFriend}>Send request</button>
            {friendError && <p className="friends-panel-error">{friendError}</p>}
          </div>

          {incoming.length > 0 && (
            <div className="friends-panel-section">
              <h3>Friend requests</h3>
              <ul className="friends-panel-list">
                {incoming.map((req) => (
                  <li key={req.fromUid} className="friends-panel-row">
                    <span>{req.fromDisplayName}</span>
                    <div className="friends-panel-actions">
                      <button type="button" onClick={() => handleAcceptFriend(req)}>Accept</button>
                      <button
                        type="button"
                        onClick={() => declineFriendRequest(user.uid, req.fromUid).then(reload)}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {collabRequests.length > 0 && (
            <div className="friends-panel-section">
              <h3>Collaborate requests</h3>
              <ul className="friends-panel-list">
                {collabRequests.map((req) => (
                  <li key={req.id} className="friends-panel-row">
                    <span>
                      {req.fromDisplayName} — {req.planName}
                    </span>
                    <div className="friends-panel-actions">
                      <button
                        type="button"
                        onClick={() => acceptCollaborateRequest(user.uid, req.id).then(reload)}
                      >
                        Allow edit
                      </button>
                      <button
                        type="button"
                        onClick={() => declineCollaborateRequest(user.uid, req.id).then(reload)}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="friends-panel-section">
            <h3>Your friends</h3>
            {friends.length === 0 ? (
              <p className="friends-panel-empty">No friends yet.</p>
            ) : (
              friendPlansGroups.map((group) => (
                <div key={group.ownerId} className="friends-panel-friend">
                  <div className="friends-panel-friend-name">{group.ownerName}</div>
                  <ul className="friends-panel-plan-list">
                    {group.plans.map((plan) => (
                      <li key={plan.id}>
                        <button
                          type="button"
                          onClick={() => {
                            openFriendPlan(group.ownerId, plan.id)
                            setOpen(false)
                          }}
                        >
                          {plan.name}
                          <span className="friends-panel-access">
                            {plan.access === 'edit' ? 'Edit' : 'View'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </aside>
      )}
    </>
  )
}
