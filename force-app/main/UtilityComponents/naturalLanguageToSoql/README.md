# Natural Language to SOQL Lightning Web Component

A Lightning Web Component that allows users to query Salesforce data using natural language, which is automatically converted to SOQL queries.

## Features

- Convert natural language to SOQL queries
- Dynamically discover and use fields from any Salesforce object
- Add to any Lightning or Experience Cloud page and configure the target object
- Customizable UI with theme color support
- Export results to CSV
- Query history tracking
- Mobile responsive design
- Dynamic example queries based on the selected object

## Installation & Setup

1. Deploy the component to your Salesforce org
2. Add the component to Lightning pages, Experience Cloud pages, or app pages
3. Configure the target object in the Lightning App Builder

## Component Configuration

The following attributes can be configured in the Lightning App Builder:

| Attribute | Description | Default |
|-----------|-------------|---------|
| Object API Name | API Name of the Salesforce object to query | *required* |
| Primary Color | Primary color for the component theme | `#22BDC1` |
| Accent Color | Accent color for the component theme | `#D5DF23` |
| Record Limit | Maximum number of records to return | `50` |
| Enable Query History | Save recent queries in browser storage | `false` |

## Usage Examples

The component supports a variety of natural language query patterns:

- "Show me high-value opportunities closing this month"
- "Find accounts in California created this year"
- "Show me the newest contacts who haven't been contacted in 3 months"
- "What are our largest deals in the Northeast region?"
- "Show open cases sorted by priority"

## How It Works

The component uses a combination of keyword matching and pattern recognition to convert natural language to SOQL. When you specify an object API name in the configuration, the component:

1. Dynamically retrieves the object's fields and metadata
2. Intelligently selects which fields to display based on common field patterns
3. Determines which fields are searchable for WHERE clauses
4. Generates appropriate example queries based on the object type
5. Processes natural language input to create valid SOQL

The component can understand:

- Date references (today, this month, last year)
- Location references (state names, regions)
- Amount qualifiers (high-value, largest, smallest)
- Status references (open, closed, won)
- Sorting indicators (newest, alphabetical, highest)

## Security Considerations

- The component respects object and field-level security (FLS)
- Queries are constructed with built-in protection against SOQL injection
- The component only accesses fields the current user has permission to view
- Rate limiting is applied to prevent performance issues

## Extending the AI Capabilities

For more advanced natural language processing, you can integrate the component with:

1. **Einstein Language Models**: Use Einstein Language API for more sophisticated query translation
2. **External AI Services**: Integrate with OpenAI API or similar services for more powerful natural language understanding
3. **Custom NLP Models**: Build and train custom models specific to your data model

## Troubleshooting

If the component is not generating the expected SOQL queries:

1. Ensure the user has the appropriate object and field permissions
2. Try using simpler language or example queries
3. Review browser console for any JavaScript errors
4. Check the generated SOQL for any issues with field selection

## Support & Contributions

For issues, feature requests, or contributions:
- Create an issue on the GitHub repository
- Contact your Salesforce admin or developer

---

Developed with 💙 by Nuvitek 