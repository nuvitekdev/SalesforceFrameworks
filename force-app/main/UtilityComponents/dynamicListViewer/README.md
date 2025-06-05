# Dynamic Record List View Component

![Dynamic Record List View Banner](https://raw.githubusercontent.com/YOUR-ORG/YOUR-REPO/main/docs/images/dynamic-list-view-banner.png)

## What is the Dynamic Record List View?

The Dynamic Record List View is a versatile Lightning Web Component (LWC) that provides an advanced, configurable list view for any Salesforce object. It goes beyond standard list views by offering enhanced filtering, sorting, searching, and a powerful record detail modal with dynamic actions and intelligent related list navigation. This component delivers a modern, intuitive interface for exploring and interacting with Salesforce data without requiring any custom development.

### Key Features

- **Object Agnostic**: Works with any standard or custom object in your org.
- **Configurable List View**: Specify exactly which fields to display as columns on the main list.
- **Related Lists from Page Layouts**: Displays related lists based on a standard page layout structure, showing only what's relevant.
- **Configurable Related List Columns**: Define the columns for each related list using a simple JSON configuration.
- **Dynamic Object Actions**: Automatically surfaces standard actions (Edit, Delete) and custom Flow actions in the record detail view.
- **Advanced Filtering**: Apply multiple filters with various operators.
- **Instant Search**: Quickly find records with real-time search capabilities.
- **Pagination**: Navigate through large data sets with page controls.
- **Dynamic Sorting**: Sort by any column with a simple click.
- **Record Detail Modal**: View complete record details without leaving the page.
- **Nested Record Navigation**: Explore related records and lookup fields with breadcrumb tracking.
- **Modern UI/UX**: Clean, Apple-inspired design with responsive layout for all devices.

## Why Use the Dynamic Record List View?

Standard Salesforce list views have limitations, and this component offers several benefits:

1. **Efficiency**: Explore records and their relationships without multiple page loads.
2. **Relevance**: Show only the related lists and actions that matter to your users, just like a standard page.
3. **Flexibility**: Configure list views and related lists to match specific business needs without custom code.
4. **Enhanced Experience**: Provide users with a more modern, intuitive data exploration interface.
5. **Reduced Clicks**: Access detailed information and perform actions with fewer clicks and page transitions.
6. **Mobile Friendly**: Responsive design works across desktop and mobile devices.

## Who Should Use This Component?

The Dynamic Record List View is ideal for:

- **Sales Teams**: Quickly view and filter customer data and related information.
- **Service Agents**: Access comprehensive case information and related records.
- **Account Managers**: Review account data and navigate through related contacts and opportunities.
- **Operations Staff**: Filter and sort through operational records efficiently.
- **Administrators**: Provide enhanced data access without building custom applications.
- **Executive Users**: Get quick insights into data with minimal navigation.
- **Data Analysts**: Explore record relationships without running reports.
- **Community Users**: Provide partner or customer access to relevant data with a modern interface.

## When to Use the Dynamic Record List View

Implement the Dynamic Record List View in these scenarios:

- When standard list views don't provide sufficient filtering or sorting capabilities
- For situations requiring quick access to record details without page navigation
- When users need to explore relationships between records efficiently
- To provide a more intuitive interface for exploring complex data relationships
- For creating embedded list views within custom UI layouts
- When deploying to mobile users who need efficient data access
- To simplify navigation between related records
- For providing filtered views of data based on specific criteria

## Where to Deploy the Dynamic Record List View

The Dynamic Record List View component can be added to:

- **Record Pages**: Add alongside related lists to provide enhanced filtering.
- **App Pages**: Create dedicated list view pages for specific objects.
- **Home Pages**: Add to user home pages for quick access to important data.
- **Communities**: Provide partner or customer access to filtered record sets.
- **Dashboard Tabs**: Include as interactive data exploration alongside dashboards.
- **Console Apps**: Add to console workspaces for agent efficiency.
- **Utility Items**: Make available as a utility item for quick data lookup.
- **Mobile App**: Deploy for on-the-go data access with rich functionality.

## How to Configure and Use

### Installation

1. Deploy the component using Salesforce CLI or directly within your Salesforce org.
2. Ensure all dependencies (Apex classes, LWC) are deployed together.

### Configuration

1. Navigate to the page where you want to add the Dynamic Record List View.
2. Edit the page and drag the **Dynamic Record List View** component from the custom components section.
3. Configure the following required properties:
   - **Object API Name**: The API name of the object to display (e.g., "Account", "Custom_Object__c").
   - **List View Fields**: Comma-separated list of field API names to display as columns (e.g., "Phone,Industry,CreatedDate").

4. Configure the following optional properties to customize the experience:
   - **Title Field**: Field to use as the title in the detail modal (default: "Name").
   - **Subtitle Field**: Field to use as the subtitle in the detail modal.
   - **Max Navigation Depth**: How many levels of related record navigation to allow (default: 1, 0 disables it).
   - **Record Type ID**: The 18-digit ID of a record type to get the correct page layout for related lists.
   - **Show Actions**: Check this box to display the action menu (Edit, Delete, Flow actions) in the record detail modal.
   - **Related List Fields Configuration**: A JSON string to specify columns for related lists. If left blank, sensible defaults will be used.
     - **Example**:
       ```json
       {
         "Contacts": ["Name", "Title", "Email"],
         "Opportunities": ["Name", "StageName", "Amount", "CloseDate"]
       }
       ```
   - **Primary Color**: Main theme color (default: #22BDC1).
   - **Accent Color**: Secondary theme color (default: #D5DF23).
   - **Text Color**: Text color (default: #1d1d1f).

### Usage

1. **View Records**: Browse the list of records with pagination controls.
2. **Sort Data**: Click column headers to sort ascending or descending.
3. **Search**: Enter text in the search box to filter records instantly.
4. **Filter**: Use the filter panel to apply specific field filters.
5. **View Details**: Click any record to open the detail modal.
6. **Perform Actions**: Use the action menu in the modal header to Edit, Delete, or launch a configured Flow for the record.
7. **Explore Related Lists**: In the "Related Lists" tab, click a list name in the left panel to see the corresponding records in a table on the right.
8. **Navigate Relationships**: Click any lookup link to drill down into related records, and use the "Back" button to navigate up the chain.

## Technical Details

### Component Structure

- **LWC Component**: `dynamicRecordListView`
- **Apex Controller**: `DynamicRecordListViewController.cls`
  - `getRecords`: Fetches the main list of records.
  - `getRecordAllFields`: Retrieves all accessible fields for the detail modal.
  - `getPageLayoutRelatedLists`: Gets the curated list of related lists for the modal sidebar.
  - `getRelatedRecords`: Fetches records for a selected related list.
  - `getObjectActions`: Gets the available standard and Flow actions for a record.

### Performance Considerations

- The component uses client-side filtering for performance when possible
- Server-side SOQL queries are optimized for specific use cases
- Pagination helps manage large data sets efficiently
- Record data for the detail modal is lazy-loaded upon click.

## Troubleshooting

### Common Issues

1. **No Records Displayed**
   - Verify **Object API Name** is correct.
   - Check that fields in **List View Fields** exist and are valid.
   - Ensure the current user has access to the object and fields.

2. **Related Lists Not Showing**
   - The Apex controller uses a hard-coded map to determine which related lists to show for standard objects. You can modify the `getCommonRelatedListsForObject` method in `DynamicRecordListViewController.cls` to add or remove lists.
   - For custom objects, ensure the relationships are correctly defined.

3. **Actions Not Appearing**
   - Ensure the **Show Actions** checkbox is checked in the component's properties.
   - For Flow actions, ensure they are configured as "Quick Actions" on the object and are active.

## Contributing

We welcome contributions to enhance the Dynamic Record List View component. Please submit pull requests with detailed descriptions of your changes.

## License

This component is available under the MIT License. See LICENSE.md for details.

---

*Developed by Nuvitek - Transforming business through innovative Salesforce solutions.* 