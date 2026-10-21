# **LeadMate LLM Guide - Complete System Architecture**

**Purpose:** This document provides a complete understanding of LeadMate's database architecture, business logic, and system design for LLM-assisted application rewrites.

**Last Updated:** 2024  
**Database Version:** PostgreSQL Schema v1.0  
**Original App:** JavaScript/localStorage → **Target:** Multi-user server application

---

## **📋 Table of Contents**

1. [System Overview](#system-overview)
2. [Database Architecture](#database-architecture)
3. [Business Logic & Rules](#business-logic--rules)
4. [User Flows & Interactions](#user-flows--interactions)
5. [API Design Guidelines](#api-design-guidelines)
6. [Data Migration Reference](#data-migration-reference)
7. [Implementation Checklist](#implementation-checklist)

---

## **System Overview**

### **What is LeadMate?**

LeadMate is a **lead management and sales follow-up system** designed for small sales teams. It helps users:
- Track prospects (leads) through the sales funnel
- Record interactions (calls, texts, meetings)
- Manage follow-up tasks with AI-assisted guidance
- Automate reminders and next actions
- Collaborate on shared leads across team members

### **Key Concepts**

- **Lead**: A prospect/contact with contact information and sales status
- **Interaction**: A recorded communication event (call, text, DM) with a lead
- **Task**: A scheduled action item assigned to a user (call someone, send text, check for reply)
- **Workspace**: Shared environment where team members collaborate on leads
- **AI Guidance**: System generates call briefs and text messages based on interaction history

### **Original Architecture**
- Client-side only (JavaScript)
- Data stored in browser localStorage (JSON)
- Single user per browser
- No backend server

### **Target Architecture**
- Multi-user web application
- PostgreSQL database
- Server-side backend (language agnostic)
- Shared workspace for team collaboration
- RESTful API or GraphQL

---

## **Database Architecture**

### **Entity Relationship Diagram**

```
┌──────────────────────────────────────────────────────────────────┐
│                         WORKSPACE LEVEL                          │
│                                                                  │
│  ┌─────────────┐                                                │
│  │  workspaces │  (Business context, shared settings)           │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ├─────────────┬──────────────┬──────────────┐          │
│         │             │              │              │          │
│    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐    │
│    │  leads  │   │  tasks  │   │ scripts │   │workspace│    │
│    │(shared) │   │(assigned│   │         │   │  _users │    │
│    └────┬────┘   │to users)│   └─────────┘   └────┬────┘    │
│         │         └────┬────┘                      │          │
│         │              │                           │          │
│    ┌────▼────┐         │                      ┌────▼────┐    │
│    │interact-│         │                      │  users  │    │
│    │ actions │         └──────────────────────▶(login,  │    │
│    └─────────┘                                │ assign) │    │
│                                               └─────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### **Table Summary**

| Table | Purpose | Shared/Personal | Key Fields |
|-------|---------|-----------------|------------|
| `users` | Authentication, task assignment | Personal | email, name, password_hash |
| `workspaces` | Team environment, business context | Shared | name, business_context, scripts |
| `workspace_users` | User ↔ Workspace membership | Junction | workspace_id, user_id |
| `leads` | Prospect/contact records | **Shared** | name, phone, email, status, interest |
| `interactions` | Communication history | Shared | lead_id, type, outcome, date |
| `tasks` | Follow-up actions | **Personal** | assigned_to_user_id, lead_id, date, type |
| `scripts` | Conversation templates | Shared | key, content |

---

## **Detailed Table Schemas**

### **1. users**

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

**Business Rules:**
- Email must be unique (used for login)
- Password must be hashed (bcrypt/argon2) before storage
- Name is displayed in UI for task assignments

**Usage in App:**
- User authentication/login
- Task assignment (`tasks.assigned_to_user_id`)
- Tracking who recorded interactions (`interactions.recorded_by_user_id`)

---

### **2. workspaces**

```sql
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    business_context TEXT,
    scripts JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Business Rules:**
- All leads, tasks, and scripts belong to a workspace
- `business_context` is used as context for AI prompt generation
- Multiple users can share one workspace

**Key Fields:**
- **business_context**: Free-text description of the business (e.g., "We help clinics save time with ReceptionMate, ClinicMate, and Online OPD")
  - Used in AI prompts for generating personalized outreach messages
- **scripts**: JSONB object storing conversation templates
  - Format: `{"cold_call_opening": "Hi Dr. [name]...", "follow_up": "..."}`
  - Alternative: Use separate `scripts` table (see below)

**Usage in App:**
- Context switcher (if user belongs to multiple workspaces)
- AI prompt generation includes `business_context`
- Script library for sales conversations

---

### **3. workspace_users**

```sql
CREATE TABLE workspace_users (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX idx_workspace_users_user ON workspace_users(user_id);
```

**Business Rules:**
- Many-to-many relationship: users can join multiple workspaces
- All users in a workspace see the same leads
- Tasks remain personal (assigned to individual users)

**Usage in App:**
- Access control (verify user belongs to workspace before showing data)
- Team management UI
- Workspace switching

---

### **4. leads**

```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- Contact Information
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    instagram VARCHAR(255),
    email VARCHAR(255),
    contact VARCHAR(255),  -- Legacy: primary contact method
    
    -- Lead Management
    status VARCHAR(50) NOT NULL DEFAULT 'new',
    interest VARCHAR(255),  -- Product interest
    memory TEXT,  -- Important notes
    
    -- Next Action
    next_action_date DATE,
    next_action_time TIME,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_lead_status CHECK (status IN (
        'new', 'demo', 'paid', 'not-interested', 
        'do-not-call', 'cant-afford', 'follow-up'
    )),
    CONSTRAINT chk_lead_contact CHECK (
        phone IS NOT NULL OR instagram IS NOT NULL OR 
        email IS NOT NULL OR contact IS NOT NULL
    )
);

CREATE INDEX idx_leads_workspace ON leads(workspace_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_next_action ON leads(next_action_date) WHERE next_action_date IS NOT NULL;
CREATE INDEX idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_leads_email ON leads(email) WHERE email IS NOT NULL;
CREATE INDEX idx_leads_instagram ON leads(instagram) WHERE instagram IS NOT NULL;
```

**Business Rules:**

**Lead Status Flow:**
```
┌─────────────────────────────────────────────────────────────┐
│                    LEAD STATUS FLOW                         │
└─────────────────────────────────────────────────────────────┘

         ┌──────────┐
    ┌───│   new    │◀──── (Initial state)
    │   └────┬─────┘
    │        │
    │        ▼
    │   ┌──────────┐
    ├───│ follow-up│◀──── (Active lead, requires follow-up)
    │   └────┬─────┘
    │        │
    │        ├────────────┐
    │        ▼            ▼
    │   ┌──────────┐  ┌──────────┐
    │   │   demo   │  │   paid   │ (Success states)
    │   └────┬─────┘  └──────────┘
    │        │
    │        ▼
    │   ┌──────────┐
    │   │   paid   │
    │   └──────────┘
    │
    └───────────┐
                ▼
    ┌────────────────────────────────┐
    │       Terminal States          │
    ├────────────────────────────────┤
    │  • not-interested              │
    │  • cant-afford                 │
    │  • do-not-call                 │
    └────────────────────────────────┘
```

- **new**: Fresh lead, no meaningful interaction yet
- **follow-up**: Active lead, requires regular follow-up
- **demo**: Lead requested a product demo (schedule demo task)
- **paid**: Converted to paying customer (success!)
- **not-interested**: Declined offer (stop follow-ups)
- **cant-afford**: Interested but cannot pay (revisit later)
- **do-not-call**: Explicitly requested no contact (legal compliance)

**Contact Fields:**
- At least ONE contact method required (phone, email, Instagram)
- `contact` field is legacy (from localStorage version) - stores primary method
- Multiple contact methods can coexist (phone + email + Instagram)

**Key Fields:**
- **interest**: Product they're interested in (e.g., "ClinicMate", "ReceptionMate", "Online OPD")
  - Used for filtering, segmentation, and AI personalization
- **memory**: Free-text notes about the lead
  - Example: "Prefers short demos", "Only available after 5 PM", "Mentioned competitor pricing"
  - Used in AI prompt to personalize outreach
- **next_action_date / next_action_time**: When to follow up next
  - Updated when scheduling tasks or recording interactions
  - Used to show "Next action: Jan 15, 2:00 PM" in lead profile

**Usage in App:**
- Main lead list/CRM view (filter by status)
- Search by name, phone, email, Instagram
- Lead profile page (shows contact info, status, history)
- AI prompt generation (includes interest, memory, interaction history)

---

### **5. interactions**

```sql
CREATE TABLE interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    
    -- Core Fields
    interaction_date DATE NOT NULL,
    type VARCHAR(50) NOT NULL,
    outcome VARCHAR(100),
    summary TEXT,
    
    -- Structured Marketing Data
    specialty VARCHAR(255),      -- Doctor's specialty
    location VARCHAR(255),       -- Practice location
    online_setup VARCHAR(50),    -- Has online setup?
    creates_content VARCHAR(50), -- Creates content?
    content_duration VARCHAR(100),
    followers VARCHAR(100),
    
    -- Flexible Storage
    additional_data JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_interaction_type CHECK (type IN (
        'Cold Call', 'Booked Call', 'Follow-up Call', 
        'greeting', 'sales conversation', 'text sent'
    )),
    CONSTRAINT chk_interaction_outcome CHECK (outcome IS NULL OR outcome IN (
        'Give me a demo', 'I want to pay', 'Not interested', 
        'Do not call', 'Let''s talk later', 'Can''t afford',
        'No answer', 'Will let me know', 'Wants to pay', 
        'Wants a demo', 'Asked to call later', 'Other',
        'Could not speak to doctor'
    ))
);

CREATE INDEX idx_interactions_lead ON interactions(lead_id);
CREATE INDEX idx_interactions_user ON interactions(recorded_by_user_id);
CREATE INDEX idx_interactions_date ON interactions(interaction_date DESC);
CREATE INDEX idx_interactions_type ON interactions(type);
CREATE INDEX idx_interactions_outcome ON interactions(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX idx_interactions_specialty ON interactions(specialty) WHERE specialty IS NOT NULL;
CREATE INDEX idx_interactions_additional_data ON interactions USING gin(additional_data);
```

**Business Rules:**

**Interaction Types:**
- **Cold Call**: First outreach to a new lead
- **Booked Call**: Scheduled call (lead agreed to talk)
- **Follow-up Call**: Subsequent conversation with existing lead
- **greeting**: Quick check-in (no sales pitch)
- **sales conversation**: Detailed product discussion
- **text sent**: WhatsApp/SMS message sent

**Interaction Outcomes (trigger actions):**

| Outcome | Action | Lead Status Change |
|---------|--------|-------------------|
| Give me a demo / Wants a demo | Create demo task | → `demo` |
| I want to pay / Wants to pay | Create payment follow-up | → `paid` (if paid) |
| Not interested | Stop follow-ups | → `not-interested` |
| Do not call | Stop ALL contact | → `do-not-call` |
| Can't afford | Pause follow-ups | → `cant-afford` |
| Let's talk later / Asked to call later | Schedule callback task | → `follow-up` |
| No answer | Retry later (auto-schedule) | (no change) |
| Will let me know | Schedule follow-up | → `follow-up` |

**Marketing Automation Fields:**

These fields enable segmentation and personalization:

- **specialty**: Medical specialty (e.g., "Dermatology", "Cardiology", "General Practice")
  - Used to: Filter leads by specialty, personalize messaging
- **location**: City/state of practice (e.g., "Mumbai, Maharashtra")
  - Used to: Geographic targeting, local references
- **online_setup**: Has existing online infrastructure? ("Yes" / "No" / "Partial")
  - Used to: Pitch appropriate products (setup service vs. content service)
- **creates_content**: Makes online content? ("Yes" / "No")
  - Used to: Identify content creators, pitch Content Mate
- **content_duration**: How long creating content (e.g., "6 months", "2 years")
  - Used to: Gauge content maturity, personalize pitch
- **followers**: Follower count (e.g., "5k", "50k")
  - Used to: Identify influencers, tailor pricing

**additional_data JSONB Examples:**

```json
{
  "opening": "Yes, available",
  "callbackDate": "2024-01-20",
  "callbackTime": "14:00",
  "reason": "Too busy this quarter",
  "product": "Online OPD",
  "paymentStatus": "Pending",
  "demoDate": "2024-01-25T10:00:00",
  "quotedPrice": "₹25,000/year",
  "delayReason": "Needs partner approval"
}
```

**Usage in App:**
- Interaction timeline on lead profile (sorted by date DESC)
- AI prompt generation (includes interaction history)
- Filtering/segmentation by specialty, location, online setup
- Analytics dashboard (conversion rates by specialty, location)

---

### **6. tasks**

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    assigned_to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,  -- NULL for general tasks
    
    -- Task Details
    type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    task_date DATE NOT NULL,
    task_time TIME,
    note TEXT,
    
    -- Status
    done BOOLEAN DEFAULT FALSE,
    closed_reason VARCHAR(100),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Relationships
    source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    daily_key VARCHAR(100),
    
    -- AI Integration
    ai_guidance JSONB DEFAULT '{}'::jsonb,
    additional_data JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_task_type CHECK (type IN (
        'call', 'text', 'dm', 'text_feedback', 
        'ai_review', 'general', 'deliver_demo'
    ))
);

CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_user ON tasks(assigned_to_user_id);
CREATE INDEX idx_tasks_lead ON tasks(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_tasks_date ON tasks(task_date) WHERE done = FALSE;
CREATE INDEX idx_tasks_done ON tasks(done);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_daily_key ON tasks(daily_key) WHERE daily_key IS NOT NULL;
CREATE INDEX idx_tasks_ai_guidance ON tasks USING gin(ai_guidance);
```

**Business Rules:**

**Task Types:**

1. **call**: Phone call task
   - Linked to a lead
   - Can have AI guidance (pre_call_brief, call_goal)
   - Title: "Call Dr. Aisha Mehta"

2. **text**: Send WhatsApp/SMS task
   - Linked to a lead
   - AI guidance includes `exact_message` (ready-to-send)
   - After marked sent → creates `text_feedback` task for next day

3. **dm**: Send Instagram DM task
   - Similar to text
   - Used when lead's primary contact is Instagram

4. **text_feedback**: Check for reply task
   - Automatically created after sending a text
   - `source_task_id` references the original text task
   - User marks: "They replied" or "No response yet"
   - If no response after 3 checks → convert to final follow-up

5. **ai_review**: Daily AI prep task
   - Generated once per day (`daily_key = "ai-YYYY-MM-DD"`)
   - Prompts user to copy prompt → paste AI JSON → apply guidance
   - Adds AI guidance to all due call/text tasks

6. **general**: Personal to-do (not lead-related)
   - `lead_id` is NULL
   - Example: "Update ClinicMate one-pager", "Review demo bookings"

7. **deliver_demo**: Conduct product demo task
   - Created when lead outcome is "Give me a demo"
   - After completion → creates feedback task next day

**Task Lifecycle:**

```
Created (done=false)
   ↓
Scheduled (task_date in future)
   ↓
Due (task_date ≤ today)
   ↓
Completed (done=true, closed_reason, completed_at)
```

**Closed Reasons:**
- `completed`: Successfully finished
- `handled`: Interaction recorded
- `sent`: Message sent
- `replied`: Lead responded
- `no-reply`: No response after checks
- `skipped`: User chose to skip
- `converted` / `dnc` / `paused`: Lead status changed (auto-close tasks)

**AI Guidance Structure:**

```json
{
  "exact_message": "Hi Dr. Patel, following up on our chat about Online OPD. Would next Tuesday work for a quick 15-min demo?",
  "pre_call_brief": "Dr. Patel practices cardiology in Pune. Previously asked about patient appointment management. Mentioned competitor pricing was too high.",
  "call_goal": "Schedule a 15-minute Online OPD demo. Address pricing objections.",
  "next_best_action": "Send calendar link with two time slots."
}
```

**Task Relationships (source_task_id):**

Example chain:
```
Task 1: "Text Dr. Aisha Mehta" (type=text)
   ↓ (source_task_id)
Task 2: "Check for reply from Dr. Aisha" (type=text_feedback, source_task_id=Task1.id)
   ↓ (if no reply, source_task_id)
Task 3: "Check for reply from Dr. Aisha" (type=text_feedback, source_task_id=Task2.id)
   ↓ (if still no reply after 3 checks, source_task_id)
Task 4: "Text Dr. Aisha Mehta" (type=text, final follow-up)
```

**Daily Key (daily_key):**
- Prevents duplicate daily tasks
- Format: `"ai-YYYY-MM-DD"`
- Only one `ai_review` task per day
- Check: `SELECT * FROM tasks WHERE daily_key = 'ai-2024-01-15' AND done = false`

**Usage in App:**
- Daily task list (filter by user + date ≤ today + done=false)
- Lead profile shows open tasks for that lead
- Task detail modal (shows AI guidance, allows reschedule/complete)
- AI workflow: Generate prompt → Apply JSON → Update ai_guidance

---

### **7. scripts**

```sql
CREATE TABLE scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, key)
);

CREATE INDEX idx_scripts_workspace ON scripts(workspace_id);
```

**Business Rules:**
- Each script has a unique key per workspace
- Scripts are templates for sales conversations

**Example Scripts:**

| Key | Content |
|-----|---------|
| `cold_call_opening` | "Hi Dr. [name], this is [your name] from [company]. I help doctors like you save time with..." |
| `booked_call_opening` | "Hi Dr. [name], [your name] this side. You had shown interest in our [product]. Is this a good time to talk?" |
| `demo_follow_up` | "Hi Dr. [name], hope you enjoyed the demo yesterday. What did you think?" |
| `text_no_reply` | "Hi Dr. [name], following up on my message. Would you like to discuss [product] this week?" |

**Usage in App:**
- Script library/editor in settings
- Pre-fill text areas during call recording
- Display in task detail modal for reference

**Alternative:** Store in `workspaces.scripts` JSONB field instead of separate table.

---

## **Business Logic & Rules**

### **Lead Status Transitions**

**Status Change Triggers:**

| Interaction Outcome | Status Change | Additional Actions |
|---------------------|---------------|-------------------|
| "Give me a demo" | → `demo` | Create demo task, close other tasks |
| "I want to pay" | → `paid` | Close all tasks |
| "Not interested" | → `not-interested` | Close all tasks |
| "Do not call" | → `do-not-call` | Close all tasks, flag for compliance |
| "Can't afford" | → `cant-afford` | Close tasks, revisit in 30+ days |
| "Let's talk later" | → `follow-up` | Schedule callback task |
| "No answer" | (no change) | Auto-schedule retry |

---

### **Task Automation Rules**

**1. After Recording Interaction:**

```javascript
if (interaction.outcome === "Give me a demo") {
  lead.status = "demo";
  if (interaction.additional_data.demoDate) {
    createTask({
      type: "deliver_demo",
      lead_id: lead.id,
      task_date: extractDate(interaction.additional_data.demoDate),
      task_time: extractTime(interaction.additional_data.demoDate)
    });
  }
  closeAllTasksForLead(lead.id);
}

if (interaction.outcome === "Let's talk later") {
  lead.status = "follow-up";
  createTask({
    type: "call",
    lead_id: lead.id,
    task_date: interaction.additional_data.callbackDate || addDays(today, 7),
    task_time: interaction.additional_data.callbackTime
  });
}

// ... similar for other outcomes
```

**2. Text Message Follow-up Chain:**

```javascript
// When user marks text as sent
markTaskDone(textTask, "sent");
createTask({
  type: "text_feedback",
  lead_id: textTask.lead_id,
  task_date: addDays(today, 1),
  source_task_id: textTask.id,
  additional_data: { replyChecks: 1 }
});

// When checking for reply
if (userSays === "No response yet") {
  const checkCount = task.additional_data.replyChecks || 1;
  
  if (checkCount >= 3) {
    // Final follow-up
    createTask({
      type: "text",
      lead_id: task.lead_id,
      task_date: today,
      title: `Final follow-up text to ${lead.name}`,
      source_task_id: task.id
    });
  } else {
    // Schedule another check in 2 days
    createTask({
      type: "text_feedback",
      lead_id: task.lead_id,
      task_date: addDays(today, 2),
      source_task_id: task.id,
      additional_data: { replyChecks: checkCount + 1 }
    });
  }
  
  markTaskDone(task, "no-reply");
}
```

**3. Daily AI Review Task:**

```javascript
// Run once per day (e.g., at midnight or first login)
function ensureAiReviewTask() {
  const today = getCurrentDate();
  const dailyKey = `ai-${today}`;
  
  // Check if already exists
  const existing = findTask({ daily_key: dailyKey, done: false });
  if (existing) return;
  
  // Count leads with due tasks
  const leadsWithDueTasks = getLeadsWithTasksDueToday();
  
  if (leadsWithDueTasks.length > 0) {
    createTask({
      type: "ai_review",
      title: `Prepare AI guidance for ${leadsWithDueTasks.length} due lead(s)`,
      note: "Copy prompt, then paste and review AI JSON before outreach.",
      task_date: today,
      daily_key: dailyKey
    });
  }
}
```

---

### **AI Integration Workflow**

**Step 1: User clicks "Copy Prompt"**

Generate prompt with context:

```javascript
function generateAIPrompt(tasks) {
  const businessContext = workspace.business_context || "(none)";
  
  const taskData = tasks.map(task => {
    const lead = getLeadById(task.lead_id);
    const interactions = getInteractionsForLead(lead.id);
    
    return {
      task_id: task.id,
      name: lead.name,
      interest: lead.interest,
      history: interactions.map(i => 
        `${i.interaction_date} ${i.type}: ${i.summary}`
      ),
      remember: lead.memory || "",
      current_task: task.type  // "call" or "text"
    };
  });
  
  return `Business context:
${businessContext}

Return ONLY a JSON array. Keep task_id exactly. Schema: [{"task_id":"exact id","recommended_channel":"call or text","exact_message":"ready-to-send text or empty","pre_call_brief":"short factual brief","call_goal":"one clear goal","next_best_action":"short action"}]

TASKS:
${JSON.stringify(taskData, null, 2)}`;
}
```

**Step 2: User pastes AI JSON response**

```json
[
  {
    "task_id": "abc-123-def",
    "recommended_channel": "text",
    "exact_message": "Hi Dr. Mehta, following up on ClinicMate. Would next Tuesday work for a quick demo?",
    "pre_call_brief": "",
    "call_goal": "",
    "next_best_action": "Send calendar link"
  },
  {
    "task_id": "xyz-456-ghi",
    "recommended_channel": "call",
    "exact_message": "",
    "pre_call_brief": "Dr. Patel is interested in content creation. Previously mentioned lack of time.",
    "call_goal": "Offer content creation service with minimal time commitment.",
    "next_best_action": "Schedule demo"
  }
]
```

**Step 3: Apply AI guidance to tasks**

```javascript
function applyAIGuidance(aiResponses) {
  aiResponses.forEach(ai => {
    const task = findTaskById(ai.task_id);
    if (!task) return;
    
    // Update task with AI guidance
    task.ai_guidance = {
      exact_message: ai.exact_message || "",
      pre_call_brief: ai.pre_call_brief || "",
      call_goal: ai.call_goal || "",
      next_best_action: ai.next_best_action || ""
    };
    
    // Change task type if AI recommends different channel
    if (ai.recommended_channel !== task.type) {
      task.type = ai.recommended_channel;
      task.title = `${capitalize(ai.recommended_channel)} ${lead.name}`;
    }
    
    updateTask(task);
  });
  
  // Mark AI review task as done
  markAIReviewTaskDone();
}
```

---

## **User Flows & Interactions**

### **Flow 1: Adding a New Lead (Cold Call)**

```
User → "New Interaction" button
  ↓
Search/Create Lead
  ├─ Search by name/phone/email/Instagram
  ├─ If found → Show existing lead → "Continue"
  └─ If not found → "New Contact" form
       ├─ Enter: Name, Phone, Instagram, Email
       └─ Submit → Create lead (status="new")
  ↓
Choose Call Type: "Cold Call" or "Booked Call"
  ↓
Record Call Details
  ├─ Call notes (free text)
  ├─ Outcome (dropdown)
  └─ Additional fields based on outcome
       ├─ If "Give me a demo" → Demo date/time
       ├─ If "Let's talk later" → Callback date/time
       └─ If "Not interested" → Reason
  ↓
Save Interaction
  ├─ Create interaction record
  ├─ Update lead status based on outcome
  ├─ Create follow-up task if needed
  └─ Close existing open tasks if terminal outcome
  ↓
Return to task list / lead profile
```

---

### **Flow 2: Daily Task Workflow with AI**

```
User logs in
  ↓
View Today's Tasks (sorted by date, overdue first)
  ├─ Shows: Call tasks, Text tasks, General tasks
  └─ AI Review task appears (if leads have due tasks)
  ↓
User clicks "AI Review" task
  ↓
Copy Prompt → Paste into AI tool (ChatGPT, Claude, etc.)
  ↓
AI returns JSON with guidance
  ↓
Paste JSON into app → Review changes
  ↓
Apply guidance
  ├─ Tasks updated with pre_call_brief / exact_message
  └─ Task types changed if AI recommends different channel
  ↓
User tackles tasks one by one:
  ├─ Call task → Shows pre_call_brief & call_goal
  │    └─ User clicks "Record Call" → (Flow 1)
  │
  └─ Text task → Shows exact_message
       ├─ User copies message → Sends in WhatsApp
       └─ User clicks "Mark Sent"
            ├─ Create interaction record (type="text sent")
            ├─ Mark task done
            └─ Create text_feedback task for tomorrow
```

---

### **Flow 3: Text Message Follow-up Chain**

```
Day 1: Text task due
  ↓
User sends text → Marks as "Sent"
  ├─ Create interaction (type="text sent", summary=message)
  ├─ Mark task done (closed_reason="sent")
  └─ Create text_feedback task (date=tomorrow, replyChecks=1)

Day 2: Check for reply task due
  ↓
User checks WhatsApp → Lead hasn't replied
  ↓
User clicks "No response yet"
  ├─ Mark task done (closed_reason="no-reply")
  └─ Create text_feedback task (date=+2 days, replyChecks=2)

Day 4: Check for reply task due
  ↓
User checks WhatsApp → Still no reply
  ↓
User clicks "No response yet"
  ├─ Mark task done (closed_reason="no-reply")
  └─ Create text_feedback task (date=+2 days, replyChecks=3)

Day 6: Check for reply task due (3rd check)
  ↓
User checks WhatsApp → Still no reply
  ↓
User clicks "No response yet"
  ├─ Mark task done (closed_reason="no-reply")
  └─ Create FINAL text task (date=today)
       └─ User sends final follow-up or pauses lead

ALTERNATIVE at any check:
User clicks "They replied"
  ↓
  ├─ Mark task done (closed_reason="replied")
  └─ Open interaction form to record conversation
```

---

### **Flow 4: Lead Profile View**

```
User clicks lead from list
  ↓
Lead Profile Sheet opens
  ├─ Header: Name, Contact info, Status badge
  ├─ Next Action: "Jan 15, 2:00 PM" (from next_action_date/time)
  ├─ Important Notes: (lead.memory)
  ├─ Open Tasks: List of incomplete tasks for this lead
  └─ Interaction History (sorted newest first)
       ├─ Date, Type, Outcome
       ├─ Summary / Notes
       └─ Structured data (specialty, location, etc.)
  ↓
Actions available:
  ├─ "Edit Contact" → Update name, phone, email, Instagram
  ├─ "New Interaction" → Record new call/text
  ├─ "Copy AI Prompt" → Generate prompt for this lead only
  └─ "Change Status" → Mark as converted, DNC, reactivate
```

---

## **API Design Guidelines**

### **RESTful Endpoints (Recommended Structure)**

#### **Authentication**

```
POST   /api/auth/register
       Body: { email, name, password }
       Returns: { user, token }

POST   /api/auth/login
       Body: { email, password }
       Returns: { user, token, workspaces }

POST   /api/auth/logout
       Headers: Authorization: Bearer <token>
```

#### **Workspaces**

```
GET    /api/workspaces
       Returns: [{ id, name, business_context }]

GET    /api/workspaces/:id
       Returns: { id, name, business_context, scripts, users }

PUT    /api/workspaces/:id
       Body: { name?, business_context?, scripts? }
```

#### **Leads**

```
GET    /api/workspaces/:workspace_id/leads
       Query: ?status=active&search=dr%20smith
       Returns: [{ id, name, contact, status, next_action_date, ... }]

POST   /api/workspaces/:workspace_id/leads
       Body: { name, phone, email, instagram, interest, memory }
       Returns: { id, ... }

GET    /api/leads/:id
       Returns: { id, name, ..., interactions: [...], open_tasks: [...] }

PUT    /api/leads/:id
       Body: { name?, phone?, status?, memory?, ... }

DELETE /api/leads/:id
```

#### **Interactions**

```
GET    /api/leads/:lead_id/interactions
       Returns: [{ id, interaction_date, type, outcome, summary, ... }]

POST   /api/leads/:lead_id/interactions
       Body: {
         interaction_date, type, outcome, summary,
         specialty?, location?, online_setup?, additional_data?
       }
       Returns: { id, ... }
       Side effects: Update lead status, create/close tasks
```

#### **Tasks**

```
GET    /api/workspaces/:workspace_id/tasks
       Query: ?assigned_to=<user_id>&date=2024-01-15&done=false
       Returns: [{ id, title, type, task_date, lead: {...}, ai_guidance }]

POST   /api/workspaces/:workspace_id/tasks
       Body: {
         assigned_to_user_id, lead_id?, type, title,
         task_date, task_time?, note?
       }
       Returns: { id, ... }

PUT    /api/tasks/:id
       Body: { task_date?, done?, closed_reason?, ai_guidance? }

DELETE /api/tasks/:id

POST   /api/tasks/:id/complete
       Body: { closed_reason }
       Returns: { success: true }
```

#### **AI Integration**

```
POST   /api/workspaces/:workspace_id/ai/generate-prompt
       Body: { task_ids: ["uuid1", "uuid2"] }
       Returns: { prompt: "Business context:\n..." }

POST   /api/workspaces/:workspace_id/ai/apply-guidance
       Body: [
         { task_id: "uuid", recommended_channel: "text", exact_message: "..." }
       ]
       Returns: { updated_count: 2 }
       Side effects: Update tasks.ai_guidance, mark ai_review task done
```

#### **Scripts**

```
GET    /api/workspaces/:workspace_id/scripts
       Returns: [{ id, key, content }]

PUT    /api/workspaces/:workspace_id/scripts/:id
       Body: { content }
```

---

### **Key Backend Logic**

**1. Task Creation After Interaction**

```python
def create_interaction(lead_id, data, user_id):
    # Create interaction record
    interaction = db.interactions.create({
        'lead_id': lead_id,
        'recorded_by_user_id': user_id,
        'interaction_date': data['interaction_date'],
        'type': data['type'],
        'outcome': data['outcome'],
        'summary': data['summary'],
        # ... other fields
    })
    
    # Handle outcome → status change + task creation
    lead = db.leads.get(lead_id)
    
    if data['outcome'] == 'Give me a demo':
        lead.status = 'demo'
        if 'demoDate' in data.get('additional_data', {}):
            db.tasks.create({
                'workspace_id': lead.workspace_id,
                'assigned_to_user_id': user_id,
                'lead_id': lead_id,
                'type': 'deliver_demo',
                'title': f'Demo with {lead.name}',
                'task_date': extract_date(data['additional_data']['demoDate']),
                'task_time': extract_time(data['additional_data']['demoDate'])
            })
        close_all_open_tasks(lead_id)
    
    elif data['outcome'] == 'I want to pay':
        lead.status = 'paid'
        close_all_open_tasks(lead_id)
    
    elif data['outcome'] == 'Not interested':
        lead.status = 'not-interested'
        close_all_open_tasks(lead_id)
    
    elif data['outcome'] == 'Do not call':
        lead.status = 'do-not-call'
        close_all_open_tasks(lead_id)
    
    elif data['outcome'] == "Let's talk later":
        lead.status = 'follow-up'
        callback_date = data.get('additional_data', {}).get('callbackDate')
        if callback_date:
            db.tasks.create({
                'workspace_id': lead.workspace_id,
                'assigned_to_user_id': user_id,
                'lead_id': lead_id,
                'type': 'call',
                'title': f'Follow up with {lead.name}',
                'task_date': callback_date,
                'task_time': data.get('additional_data', {}).get('callbackTime')
            })
            lead.next_action_date = callback_date
    
    # ... handle other outcomes
    
    lead.save()
    return interaction
```

**2. Text Feedback Chain Logic**

```python
def handle_text_feedback(task_id, response, user_id):
    task = db.tasks.get(task_id)
    lead = db.leads.get(task.lead_id)
    
    if response == 'replied':
        # Lead responded - open interaction form
        task.done = True
        task.closed_reason = 'replied'
        task.completed_at = now()
        task.save()
        return {'action': 'record_interaction'}
    
    elif response == 'no_reply':
        # No response - schedule next check or final follow-up
        reply_checks = task.additional_data.get('replyChecks', 1)
        
        task.done = True
        task.closed_reason = 'no-reply'
        task.completed_at = now()
        task.save()
        
        if reply_checks >= 3:
            # Final follow-up
            db.tasks.create({
                'workspace_id': task.workspace_id,
                'assigned_to_user_id': user_id,
                'lead_id': task.lead_id,
                'type': 'text',
                'title': f'Final follow-up text to {lead.name}',
                'task_date': today(),
                'source_task_id': task.id
            })
            return {'action': 'final_followup_created'}
        else:
            # Schedule another check
            db.tasks.create({
                'workspace_id': task.workspace_id,
                'assigned_to_user_id': user_id,
                'lead_id': task.lead_id,
                'type': 'text_feedback',
                'title': f'Check for reply from {lead.name}',
                'task_date': today() + timedelta(days=2),
                'source_task_id': task.id,
                'additional_data': {'replyChecks': reply_checks + 1}
            })
            return {'action': 'next_check_scheduled', 'days': 2}
```

---

## **Data Migration Reference**

### **localStorage to PostgreSQL Mapping**

**Original localStorage structure:**

```json
{
  "version": 2,
  "context": "We help clinics save time...",
  "scripts": {
    "cold_call": "Hi Dr..."
  },
  "leads": [
    {
      "id": "uuid",
      "name": "Dr. Aisha Mehta",
      "contact": "@draishamehta",
      "phone": "9876543210",
      "instagram": "@draishamehta",
      "email": "aisha@example.com",
      "interest": "ClinicMate",
      "memory": "Prefers short demos",
      "status": "follow-up",
      "converted": false,
      "dnc": false,
      "noReply": false,
      "nextAction": {
        "date": "2024-01-15",
        "time": "14:00"
      },
      "interactions": [
        {
          "id": "uuid",
          "date": "2024-01-10",
          "type": "Booked Call",
          "kind": "sales conversation",
          "summary": "Interested in ClinicMate",
          "outcome": "Let's talk later",
          "data": {
            "specialty": "Dermatology",
            "location": "Mumbai",
            "setup": "No"
          }
        }
      ]
    }
  ],
  "tasks": [
    {
      "id": "uuid",
      "leadId": "uuid",
      "type": "call",
      "title": "Call Dr. Aisha Mehta",
      "date": "2024-01-15",
      "time": "14:00",
      "done": false,
      "ai": {
        "pre_call_brief": "...",
        "call_goal": "..."
      }
    }
  ]
}
```

**Migration Steps:**

1. **Create admin user** (or import from existing user system)
2. **Create workspace**:
   - `name`: "Default Workspace" or from config
   - `business_context`: from `db.context`
   - `scripts`: from `db.scripts` (if using JSONB) or migrate to scripts table
3. **Migrate leads**:
   - Map `converted=true` → `status='paid'`
   - Map `dnc=true` → `status='do-not-call'`
   - Map `noReply=true` → `status='follow-up'`
   - Otherwise use `status` field if present, default to `'new'`
   - Extract contact methods from `contact` field if separate fields are empty
   - Flatten `nextAction` to `next_action_date` and `next_action_time`
4. **Migrate interactions**:
   - Loop through each lead's `interactions` array
   - Create separate interaction records linked to lead
   - Map `kind` → `type` (or use `type` if present)
   - Extract structured fields (`specialty`, `location`, etc.) from `data` object
   - Store remaining `data` in `additional_data` JSONB
   - Set `recorded_by_user_id` to admin user (or distribute among team)
5. **Migrate tasks**:
   - Map `leadId` → `lead_id`
   - Map `ai` object → `ai_guidance` JSONB
   - Assign all tasks to admin user (or distribute)
   - Set `workspace_id` to created workspace
   - Preserve `sourceTaskId` → `source_task_id` relationships

---

## **Implementation Checklist**

### **Phase 1: Database Setup**
- [ ] Set up PostgreSQL database
- [ ] Run schema creation scripts (all 7 tables)
- [ ] Create indexes
- [ ] Set up database connection pooling
- [ ] Create admin user account

### **Phase 2: Backend Core**
- [ ] Choose backend framework (Express.js, FastAPI, Django, etc.)
- [ ] Implement authentication (JWT or sessions)
- [ ] Create user registration/login endpoints
- [ ] Implement workspace access control middleware
- [ ] Set up database ORM/query builder

### **Phase 3: Lead Management API**
- [ ] Implement leads CRUD endpoints
- [ ] Add lead search/filter functionality
- [ ] Implement lead status change logic
- [ ] Add contact deduplication check

### **Phase 4: Interaction Recording**
- [ ] Create interaction endpoints
- [ ] Implement outcome → status/task logic
- [ ] Add interaction history fetching
- [ ] Implement marketing automation field filtering

### **Phase 5: Task Management**
- [ ] Implement tasks CRUD endpoints
- [ ] Add task filtering (by user, date, status)
- [ ] Implement task completion logic
- [ ] Build task chain logic (text feedback)
- [ ] Add daily AI review task generation

### **Phase 6: AI Integration**
- [ ] Build AI prompt generation endpoint
- [ ] Implement AI guidance application endpoint
- [ ] Add AI guidance to task detail responses

### **Phase 7: Frontend**
- [ ] Build authentication UI (login/register)
- [ ] Create main dashboard (task list)
- [ ] Build lead list and search
- [ ] Create lead profile view
- [ ] Implement interaction recording forms
- [ ] Build task detail modals
- [ ] Add AI workflow UI (copy prompt, paste JSON)

### **Phase 8: Testing & Polish**
- [ ] Test lead status transitions
- [ ] Test task automation (callbacks, text chains)
- [ ] Test AI workflow end-to-end
- [ ] Add error handling
- [ ] Implement loading states
- [ ] Add data export functionality

### **Phase 9: Migration**
- [ ] Create migration script (localStorage → PostgreSQL)
- [ ] Test migration with sample data
- [ ] Run production migration
- [ ] Verify data integrity

### **Phase 10: Deployment**
- [ ] Set up production database
- [ ] Configure environment variables
- [ ] Deploy backend
- [ ] Deploy frontend
- [ ] Set up monitoring and logging

---

## **Key Considerations for LLM Implementation**

When implementing this system, keep in mind:

1. **UUIDs everywhere**: All primary keys are UUIDs (not auto-increment integers)
2. **Timestamps**: Always use `TIMESTAMP WITH TIME ZONE` for timezone-aware storage
3. **JSONB flexibility**: Use JSONB for variable data, but don't abuse it - keep queryable fields as columns
4. **Cascade deletes**: Most foreign keys have `ON DELETE CASCADE` - deleting a workspace deletes all data
5. **Null vs. empty**: Distinguish between NULL (not provided) and empty string (explicitly empty)
6. **Status enums**: Lead status and task types are constrained - validate before insert
7. **Soft deletes optional**: Schema doesn't include soft deletes - add `deleted_at` if needed
8. **Audit trails optional**: No created_by/updated_by fields - add if needed
9. **Task chains**: `source_task_id` creates parent-child relationships - preserve when copying tasks
10. **Daily keys**: Prevent duplicate daily tasks using `daily_key` uniqueness check

---

**End of LLM Guide**

This document provides complete context for any LLM to implement, extend, or modify the LeadMate application in any language or framework.
