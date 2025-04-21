/**
 * Serra Dashboard
 * 
 * Main module for the Serra AI-controlled dashboard designer/runner
 * that integrates with Inox for scripting.
 */

import { InoxScriptEngine } from './inox-integration';

export class SerraDashboard {
  private scriptEngine: InoxScriptEngine;
  private components: Map<string, any> = new Map();
  private dataBindings: Map<string, string[]> = new Map();
  private data: Map<string, any> = new Map();
  private eventHandlers: Map<string, Map<string, Function[]>> = new Map();
  
  constructor() {
    this.scriptEngine = new InoxScriptEngine();
    
    // Register Serra API functions with Inox
    this.registerInoxAPI();
  }
  
  /**
   * Initialize the dashboard
   */
  public async initialize(): Promise<boolean> {
    try {
      // Initialize the Inox script engine
      await this.scriptEngine.initialize();
      
      // Register Serra dashboard object with Inox
      this.scriptEngine.setInoxValue('serra-dashboard', this);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Serra dashboard:', error);
      return false;
    }
  }
  
  /**
   * Register Serra API functions with Inox
   */
  private registerInoxAPI(): void {
    // Component management
    this.scriptEngine.registerJsVerb('serra-dashboard.components.create', 
      (id: string, type: string) => this.createComponent(id, type));
    
    this.scriptEngine.registerJsVerb('serra-dashboard.components.get', 
      (id: string) => this.getComponent(id));
    
    this.scriptEngine.registerJsVerb('serra-dashboard.components.update', 
      (id: string, properties: any) => this.updateComponent(id, properties));
    
    this.scriptEngine.registerJsVerb('serra-dashboard.components.delete', 
      (id: string) => this.deleteComponent(id));
    
    // Data binding
    this.scriptEngine.registerJsVerb('serra-dashboard.data.bind', 
      (target: string, source: string) => this.bindData(target, source));
    
    this.scriptEngine.registerJsVerb('serra-dashboard.data.get', 
      (id: string) => this.getData(id));
    
    this.scriptEngine.registerJsVerb('serra-dashboard.data.set', 
      (id: string, value: any) => this.setData(id, value));
    
    // Event handling
    this.scriptEngine.registerJsVerb('serra-dashboard.events.register', 
      (id: string, event: string, handler: any) => this.registerEventHandler(id, event, handler));
  }
  
  /**
   * Load and execute a dashboard script
   * 
   * @param scriptPath Path to the Inox script
   */
  public async loadScript(scriptPath: string): Promise<any> {
    return this.scriptEngine.executeFile(scriptPath);
  }
  
  /**
   * Execute a dashboard script
   * 
   * @param script Inox script content
   */
  public async executeScript(script: string): Promise<any> {
    return this.scriptEngine.executeScript(script);
  }
  
  /**
   * Create a dashboard component
   * 
   * @param id Unique identifier for the component
   * @param type Component type
   * @returns The created component
   */
  public createComponent(id: string, type: string): any {
    const component = {
      id,
      type,
      properties: {},
      created: Date.now()
    };
    
    this.components.set(id, component);
    return component;
  }
  
  /**
   * Get a dashboard component by ID
   * 
   * @param id Component ID
   * @returns The component or undefined if not found
   */
  public getComponent(id: string): any {
    return this.components.get(id);
  }
  
  /**
   * Update a dashboard component
   * 
   * @param id Component ID
   * @param properties Properties to update
   * @returns Updated component
   */
  public updateComponent(id: string, properties: any): any {
    const component = this.components.get(id);
    if (!component) {
      throw new Error(`Component with ID ${id} not found`);
    }
    
    component.properties = {
      ...component.properties,
      ...properties
    };
    
    component.updated = Date.now();
    this.components.set(id, component);
    
    // Update any bound data
    this.updateBindings(id);
    
    // Trigger update event
    this.triggerEvent(id, 'update', component);
    
    return component;
  }
  
  /**
   * Delete a dashboard component
   * 
   * @param id Component ID
   * @returns True if deleted
   */
  public deleteComponent(id: string): boolean {
    const deleted = this.components.delete(id);
    
    if (deleted) {
      // Clean up any event handlers
      this.eventHandlers.delete(id);
      
      // Clean up any data bindings
      this.dataBindings.forEach((targets, source) => {
        const filteredTargets = targets.filter(target => target !== id);
        if (filteredTargets.length === 0) {
          this.dataBindings.delete(source);
        } else {
          this.dataBindings.set(source, filteredTargets);
        }
      });
      
      // Trigger delete event
      this.triggerEvent(id, 'delete', { id });
    }
    
    return deleted;
  }
  
  /**
   * Bind data from a source to a target
   * 
   * @param target Target ID (component or data)
   * @param source Source ID (data)
   */
  public bindData(target: string, source: string): void {
    let targets = this.dataBindings.get(source) || [];
    if (!targets.includes(target)) {
      targets.push(target);
    }
    this.dataBindings.set(source, targets);
    
    // Initial update
    const value = this.getData(source);
    if (value !== undefined) {
      this.updateBinding(target, value);
    }
  }
  
  /**
   * Get data by ID
   * 
   * @param id Data ID
   * @returns Data value
   */
  public getData(id: string): any {
    return this.data.get(id);
  }
  
  /**
   * Set data by ID
   * 
   * @param id Data ID
   * @param value Value to set
   */
  public setData(id: string, value: any): void {
    this.data.set(id, value);
    
    // Update any bound components
    this.updateBindings(id);
    
    // Trigger data change event
    this.triggerEvent(id, 'dataChange', { id, value });
  }
  
  /**
   * Update all bindings for a data source
   * 
   * @param sourceId Source data ID
   */
  private updateBindings(sourceId: string): void {
    const targets = this.dataBindings.get(sourceId) || [];
    const value = this.getData(sourceId);
    
    for (const targetId of targets) {
      this.updateBinding(targetId, value);
    }
  }
  
  /**
   * Update a specific binding
   * 
   * @param targetId Target ID
   * @param value Value to set
   */
  private updateBinding(targetId: string, value: any): void {
    const component = this.components.get(targetId);
    if (component) {
      // If target is a component, update its value property
      component.properties.value = value;
      this.components.set(targetId, component);
      
      // Trigger binding update event
      this.triggerEvent(targetId, 'bindingUpdate', { targetId, value });
    } else {
      // If target is data, update the data
      this.data.set(targetId, value);
    }
  }
  
  /**
   * Register an event handler
   * 
   * @param id Component ID
   * @param event Event name
   * @param handler Handler function or Inox verb name
   */
  public registerEventHandler(id: string, event: string, handler: any): void {
    if (!this.eventHandlers.has(id)) {
      this.eventHandlers.set(id, new Map());
    }
    
    const componentHandlers = this.eventHandlers.get(id)!;
    
    if (!componentHandlers.has(event)) {
      componentHandlers.set(event, []);
    }
    
    const handlers = componentHandlers.get(event)!;
    handlers.push(handler);
  }
  
  /**
   * Trigger an event
   * 
   * @param id Component ID
   * @param event Event name
   * @param data Event data
   */
  public triggerEvent(id: string, event: string, data: any): void {
    const componentHandlers = this.eventHandlers.get(id);
    if (!componentHandlers) return;
    
    const handlers = componentHandlers.get(event);
    if (!handlers || handlers.length === 0) return;
    
    for (const handler of handlers) {
      if (typeof handler === 'string') {
        // If handler is an Inox verb name
        this.scriptEngine.callVerb(handler, data);
      } else if (typeof handler === 'function') {
        // If handler is a JavaScript function
        handler(data);
      }
    }
  }
  
  /**
   * Create a complete dashboard from an Inox script
   * 
   * @param scriptPath Path to the dashboard script
   */
  public async createDashboard(scriptPath: string): Promise<void> {
    await this.loadScript(scriptPath);
  }
  
  /**
   * Clean up resources
   */
  public dispose(): void {
    this.scriptEngine.dispose();
    this.components.clear();
    this.dataBindings.clear();
    this.data.clear();
    this.eventHandlers.clear();
  }
}
