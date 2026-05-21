# Zentia AI - CRM Integrations (Zapier / Make.com)

Zentia AI supports native, real-time syncing of your leads and booked meetings to any CRM (HubSpot, Salesforce, Pipedrive, Apollo, etc.) using **Webhooks**.

## How it works
When the AI bot successfully qualifies a lead OR books a meeting, Zentia fires a JSON payload to your custom Webhook URL.

### 1. Set up a "Catch Webhook" trigger
1. Go to [Zapier](https://zapier.com) or [Make.com](https://make.com).
2. Create a new automation (Zap / Scenario).
3. Choose **Webhooks by Zapier** (or Custom Webhook in Make) as the Trigger.
4. Select **Catch Hook**.
5. Copy the generated Webhook URL (e.g., `https://hooks.zapier.com/hooks/catch/...`).

### 2. Connect it to Zentia
1. Open the Zentia Dashboard.
2. Click **Edit** on your Agent.
3. Paste the URL into the **Webhook URL (Optional)** field.
4. Save the agent.

### 3. Webhook Payload Structure
When a lead is captured, Zentia sends this data to your webhook:
```json
{
  "event": "meeting_booked", 
  "agent": { 
    "id": "agent_12345", 
    "name": "Alex SDR" 
  },
  "lead": { 
    "chatId": 987654321, 
    "username": "johndoe", 
    "status": "Meeting Booked", 
    "lastMessage": "Yes, tomorrow at 2 PM works.",
    "history": [
       {"role": "user", "content": "Tell me more."},
       {"role": "assistant", "content": "We offer..."}
    ]
  }
}
```
*(Note: `event` can be either `"lead_qualified"` or `"meeting_booked"`)*

### 4. Connect your CRM
1. Go back to Zapier/Make.
2. Add an Action step (e.g., **HubSpot -> Create Contact** or **Salesforce -> Create Lead**).
3. Map the webhook data fields (like `lead.username` and `lead.lastMessage`) to your CRM fields.
4. Turn on the automation!
